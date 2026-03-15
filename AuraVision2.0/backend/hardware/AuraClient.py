"""
AuraClient.py — Aura Vision Hardware Client  (Raspberry Pi Zero 2 W)
=======================================================================
Features
  • Live video stream  →  Guide dashboard (JPEG frames via Socket.IO)
  • GPS location       →  Guide map + DB lastLocation update
  • Voice interaction  →  Tamil / English STT → GPT-4o Vision / Face / OCR / Chat
  • Face recognition   →  Fetches descriptors from backend, matches locally with face_recognition lib
  • History            →  Every AI query is logged to the DB via /api/ai/describe
  • Auto TTS           →  edge-tts (Tamil / English auto-detect) + espeak fallback

Install (run once on Pi):
  sudo apt install -y python3-picamera2 espeak libatlas-base-dev
  pip3 install python-socketio[client] pyserial pynmea2 requests \\
               opencv-python-headless SpeechRecognition face_recognition \\
               edge-tts
"""

import os, re, time, base64, threading, subprocess, json
import serial, pynmea2, socketio, requests, cv2
import speech_recognition as sr

# Optional — face_recognition requires dlib (heavy but works on Pi 4; skip on Pi Zero)
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
    print("[FACE] ✅  face_recognition available")
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    print("[FACE] ⚠️  face_recognition not installed — face mode will use server-side detection only")

# ╔══════════════════════════════════════════════════════════╗
# ║              HARDCODED CONFIGURATION                     ║
# ╠══════════════════════════════════════════════════════════╣

SERVER_URL        = "https://b-smart-glass-aura-vision.onrender.com"
DEVICE_ID         = "device_001"          # Links Pi → guide@auravision.com
USER_ID           = "65a1234567890abcdef12345"  # VI user's MongoDB _id (seeded demo)

GPS_PORT          = "/dev/serial0"
GPS_BAUDRATE      = 9600
GPS_TIMEOUT       = 5
GPS_EMIT_INTERVAL = 3.0

CAM_WIDTH         = 640
CAM_HEIGHT        = 480
JPEG_QUALITY      = 60
FRAME_INTERVAL    = 0.15              # ~6-7 fps video stream

AI_INTERVAL       = 0                 # 0 = disabled (voice-activated only)
LANGUAGE          = "English"         # "English" or "Tanglish"

RECORD_SECONDS    = 4                 # Voice recording duration
AUDIO_FILE        = "/tmp/aura_input.wav"

# Face cache: refresh every 5 minutes so new faces added by Guide appear quickly
FACE_CACHE_TTL    = 300
_face_cache       = {"descriptors": [], "names": [], "fetched_at": 0}
_face_cache_lock  = threading.Lock()

# ╚══════════════════════════════════════════════════════════╝

# ── SHARED STATE ──────────────────────────────────────────────────────────────
latest_frame_b64  = None
latest_gps        = None
frame_lock        = threading.Lock()
gps_lock          = threading.Lock()

# ── SOCKET.IO CLIENT ──────────────────────────────────────────────────────────
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    reconnection_delay=2,
    reconnection_delay_max=10,
    logger=False,
    engineio_logger=False,
)

@sio.event
def connect():
    print(f"\n[SOCKET] ✅  Connected  (sid={sio.sid})")
    sio.emit("join-room", DEVICE_ID)
    print(f"[SOCKET] 🚪  Joined room '{DEVICE_ID}'")
    # Notify Guide dashboard that hardware camera is ready (triggers WebRTC UI switch)
    sio.emit("vi-ready")
    print("[SOCKET] 📷  'vi-ready' sent — Guide dashboard switched to hardware feed")

@sio.event
def connect_error(data):
    print(f"[SOCKET] ❌  Connection error: {data}")

@sio.event
def disconnect():
    print("[SOCKET] 🔌  Disconnected — auto-reconnecting …")

# ==========================================
# 🗣️ TTS — AUTO LANGUAGE DETECTION
# ==========================================

def speak(text: str):
    """Speak text. Auto-detects Tamil script vs English/Tanglish."""
    if not text:
        return
    print(f"🗣️  AI Says: {text}")
    clean = text.replace("'", "").replace('"', "").replace("\n", " ").strip()

    # Detect Tamil Unicode block (U+0B80–U+0BFF)
    if re.search(r"[\u0B80-\u0BFF]", clean):
        voice = "ta-IN-ValluvarNeural"
        print("[TTS] 🔹 Tamil detected → Valluvar voice")
    else:
        voice = "en-IN-PrabhatNeural"
        print("[TTS] 🔹 English/Tanglish → Prabhat voice")

    try:
        cmd = f'edge-tts --text "{clean}" --voice {voice} --rate=+10% --write-media /tmp/aura_response.mp3'
        subprocess.run(cmd, shell=True, check=True, timeout=15)
        os.system("mpv --no-terminal /tmp/aura_response.mp3 > /dev/null 2>&1")
    except Exception:
        # Fallback to espeak
        os.system(f"espeak -v en-us '{clean}' 2>/dev/null")

# ==========================================
# 🎤 STT — HYBRID TAMIL + ENGLISH
# ==========================================

recognizer = sr.Recognizer()

def record_and_transcribe() -> str | None:
    """Record mic audio and transcribe using Google STT (ta-IN handles both Tamil & English)."""
    print("\n🎤  Listening …")
    os.system(
        f"arecord -D plughw:0 -c1 -r 16000 -f S16_LE -t wav "
        f"-d {RECORD_SECONDS} {AUDIO_FILE} 2>/dev/null"
    )
    try:
        with sr.AudioFile(AUDIO_FILE) as src:
            audio = recognizer.record(src)
            # ta-IN returns Tamil script where applicable; GPT-4o handles it natively
            text = recognizer.recognize_google(audio, language="ta-IN")
            print(f"✅  You said: {text}")
            return text
    except sr.UnknownValueError:
        print("[STT] Could not understand audio")
    except Exception as e:
        print(f"[STT] Error: {e}")
    return None

# ── CAMERA INIT ───────────────────────────────────────────────────────────────

def init_camera():
    """Try Picamera2 first, fall back to USB webcam."""
    try:
        from picamera2 import Picamera2
        cam = Picamera2()
        cam.configure(cam.create_video_configuration(
            main={"size": (CAM_WIDTH, CAM_HEIGHT), "format": "RGB888"}
        ))
        cam.start()
        time.sleep(1.0)
        def capture():
            return cv2.cvtColor(cam.capture_array(), cv2.COLOR_RGB2BGR)
        print(f"[CAM] ✅  Picamera2 ready  ({CAM_WIDTH}×{CAM_HEIGHT})")
        return capture, cam.stop
    except Exception as e:
        print(f"[CAM] Picamera2 unavailable ({e}) — trying USB webcam …")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("[CAM] ❌  No camera found.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_HEIGHT)

    def capture():
        ret, frame = cap.read()
        if not ret:
            raise RuntimeError("Camera read failed")
        return frame

    print(f"[CAM] ✅  USB webcam ready  ({CAM_WIDTH}×{CAM_HEIGHT})")
    return capture, cap.release

# ── VIDEO STREAMING THREAD ────────────────────────────────────────────────────

def video_stream_thread():
    """Capture frames, cache latest for AI use, and stream to Guide via socket."""
    global latest_frame_b64
    capture, release = init_camera()
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
    print(f"[VIDEO] 📡  Streaming at ~{1/FRAME_INTERVAL:.0f} fps  (JPEG quality={JPEG_QUALITY})")

    try:
        while True:
            t0 = time.time()
            try:
                frame = capture()
            except Exception as e:
                print(f"[VIDEO] ⚠️  Capture error: {e}")
                time.sleep(0.5)
                continue

            ret, buf = cv2.imencode(".jpg", frame, encode_params)
            if not ret:
                continue

            b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

            with frame_lock:
                latest_frame_b64 = b64

            # Emit to socket so Guide dashboard receives it as receive-video-frame
            if sio.connected:
                sio.emit("send-video-frame", b64)

            elapsed = time.time() - t0
            wait = FRAME_INTERVAL - elapsed
            if wait > 0:
                time.sleep(wait)
    finally:
        release()

# ── GPS THREAD ────────────────────────────────────────────────────────────────

def gps_thread():
    """Parse NMEA sentences, emit send-location to server (updates DB + Guide map)."""
    global latest_gps
    print(f"[GPS] Opening {GPS_PORT} @ {GPS_BAUDRATE} baud …")

    try:
        ser = serial.Serial(GPS_PORT, baudrate=GPS_BAUDRATE, timeout=GPS_TIMEOUT)
        print("[GPS] ✅  Serial port open")
    except serial.SerialException as e:
        print(f"[GPS] ❌  Cannot open serial port: {e}")
        return

    last_emit, count, fix_got = 0, 0, False

    while True:
        try:
            raw = ser.readline()
            if not raw or raw.strip() == b"":
                print("[GPS] ⏳  Waiting for serial data …")
                time.sleep(1)
                continue

            line = raw.decode("ascii", errors="replace").strip()
            count += 1
            if count % 30 == 1:
                print(f"[GPS] Raw NMEA: {line}")

            if not any(line.startswith(p) for p in
                       ("$GPGGA", "$GNGGA", "$GPRMC", "$GNRMC")):
                continue

            try:
                msg = pynmea2.parse(line)
            except pynmea2.ParseError as pe:
                print(f"[GPS] ⚠️  Parse error: {pe}")
                continue

            if not hasattr(msg, "latitude") or msg.latitude in ("", None):
                if not fix_got:
                    print("[GPS] ⏳  Waiting for GPS lock …")
                continue

            try:
                lat = float(msg.latitude)
                lng = float(msg.longitude)
            except (ValueError, TypeError):
                continue

            if lat == 0.0 and lng == 0.0:
                continue

            if not fix_got:
                print(f"[GPS] 🛰️   GPS FIX!  lat={lat:.6f}  lng={lng:.6f}")
                fix_got = True

            with gps_lock:
                latest_gps = {"lat": lat, "lng": lng}

            now = time.time()
            if now - last_emit < GPS_EMIT_INTERVAL:
                continue
            last_emit = now

            if sio.connected:
                payload = {"deviceId": DEVICE_ID, "lat": lat, "lng": lng}
                print(f"[GPS] 📡  send-location  lat={lat:.6f}  lng={lng:.6f}")
                sio.emit("send-location", payload)

        except serial.SerialException as se:
            print(f"[GPS] ❌  Serial error: {se} — retrying in 5 s …")
            time.sleep(5)
        except UnicodeDecodeError:
            pass
        except Exception as ex:
            print(f"[GPS] ❌  Unexpected: {ex}")
            time.sleep(2)

# ── FACE CACHE ────────────────────────────────────────────────────────────────

def _fetch_face_descriptors():
    """
    Download face descriptors saved for this device's VI user from the backend.
    Returns list of (name, descriptor_array) tuples.
    """
    try:
        # Backend GET /api/faces/:userId — we pass the known USER_ID
        url = f"{SERVER_URL}/api/faces/{USER_ID}"
        resp = requests.get(url, timeout=10)
        if not resp.ok:
            print(f"[FACE] ⚠️  Fetch failed: HTTP {resp.status_code}")
            return []

        faces = resp.json()
        result = []
        for f in faces:
            descriptor = f.get("descriptor")
            name = f.get("name", "Unknown")
            if descriptor and len(descriptor) == 128:
                import numpy as np
                result.append((name, np.array(descriptor, dtype=float)))
        print(f"[FACE] ✅  Loaded {len(result)} face(s) from server")
        return result
    except Exception as e:
        print(f"[FACE] ❌  Could not fetch faces: {e}")
        return []

def get_face_cache():
    """Return cached face descriptors, refreshing if TTL has expired."""
    global _face_cache
    now = time.time()
    with _face_cache_lock:
        if now - _face_cache["fetched_at"] > FACE_CACHE_TTL:
            pairs = _fetch_face_descriptors()
            _face_cache = {
                "descriptors": [p[1] for p in pairs],
                "names":       [p[0] for p in pairs],
                "fetched_at":  now,
            }
        return _face_cache["descriptors"], _face_cache["names"]

def identify_face_in_frame(frame_bgr) -> str | None:
    """
    Run local face_recognition on a BGR frame.
    Returns the matched person's name, or None if unknown.
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    import numpy as np
    descriptors, names = get_face_cache()
    if not descriptors:
        return None

    # face_recognition expects RGB
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb, model="hog")  # fast on Pi
    if not locations:
        return None

    encodings = face_recognition.face_encodings(rgb, locations)
    for enc in encodings:
        distances = face_recognition.face_distance(descriptors, enc)
        best_idx  = int(distances.argmin())
        if distances[best_idx] < 0.6:
            matched_name = names[best_idx]
            print(f"[FACE] 🙂  Recognised: {matched_name}  (dist={distances[best_idx]:.3f})")
            return matched_name
    return None

# ── MODE DETECTION (mirrors frontend keywords) ────────────────────────────────

_FACE_KW   = ["who","yaar","face","person","identify","recognize","mugam","aalu","ivan","evan","avar","theriyuma"]
_OCR_KW    = ["read","text","paper","menu","board","bill","receipt","sign","padi","ezhuthu","enna ezhuthu"]
_VISION_KW = ["describe","look","see","what","surroundings","around","munnadi","enna irukku","paar","scene","obstacle","danger"]
_CHAT_KW   = ["hello","hi","vanakkam","joke","time","weather","thank","nandri","help","eppadi"]

def detect_mode(text: str) -> str:
    t = text.lower()
    if any(k in t for k in _FACE_KW):   return "face"
    if any(k in t for k in _OCR_KW):    return "ocr"
    if any(k in t for k in _VISION_KW): return "vision"
    if any(k in t for k in _CHAT_KW):   return "chat"
    return "vision"  # default: always use camera for VI users

# ── AI QUERY (Voice-triggered) ────────────────────────────────────────────────

def query_ai(user_text: str, frame_bgr):
    """
    Determine mode from voice text, optionally run local face recognition,
    then POST to /api/ai/describe and speak the response.
    Also logs to DB history via the backend.
    """
    mode = detect_mode(user_text)
    print(f"[AI] Mode: {mode.upper()}  |  Query: {user_text[:60]}")

    # ── LOCAL FACE RECOGNITION (fast, offline) ────────────────────────────
    if mode == "face" and FACE_RECOGNITION_AVAILABLE and frame_bgr is not None:
        local_match = identify_face_in_frame(frame_bgr)
        if local_match:
            reply = f"{local_match} is nearby you." if LANGUAGE == "English" \
                    else f"{local_match} unga pakkathula irukkaru."
            speak(reply)
            # Still log to backend for history
            _log_to_backend(user_text, reply, frame_bgr, mode)
            return

    # ── SERVER-SIDE AI (vision / face / ocr / chat) ───────────────────────
    frame_b64 = None
    if mode in ("vision", "face", "ocr") and frame_bgr is not None:
        ret, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ret:
            frame_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

    with gps_lock:
        gps = latest_gps or {}

    payload = {
        "deviceId":    DEVICE_ID,
        "userId":      USER_ID,
        "imageBase64": frame_b64,
        "prompt":      user_text,
        "mode":        mode,
        "language":    LANGUAGE,
        "lat":         gps.get("lat", 0),
        "lng":         gps.get("lng", 0),
    }

    speak("Mm-hmm")  # Natural 'Thinking' acknowledgement
    try:
        resp = requests.post(f"{SERVER_URL}/api/ai/describe", json=payload, timeout=20)
        if resp.ok:
            reply = resp.json().get("description", "No response.")
            speak(reply)
        else:
            speak("Server error. Please try again.")
            print(f"[AI] ⚠️  HTTP {resp.status_code}: {resp.text[:120]}")
    except requests.exceptions.Timeout:
        speak("Server is busy. Please try again.")
    except Exception as e:
        speak("Connection error.")
        print(f"[AI] ❌  {e}")

def _log_to_backend(prompt: str, reply: str, frame_bgr, mode: str):
    """Fire-and-forget: log a completed interaction to the backend for history."""
    def _post():
        try:
            with gps_lock:
                gps = latest_gps or {}
            payload = {
                "deviceId":    DEVICE_ID,
                "userId":      USER_ID,
                "imageBase64": None,
                "prompt":      prompt,
                "mode":        mode,
                "language":    LANGUAGE,
                "lat":         gps.get("lat", 0),
                "lng":         gps.get("lng", 0),
            }
            requests.post(f"{SERVER_URL}/api/ai/describe", json=payload, timeout=10)
        except Exception:
            pass
    threading.Thread(target=_post, daemon=True).start()

# ── BACKGROUND AI DESCRIBE THREAD (periodic auto-describe, optional) ───────

def ai_describe_thread():
    """Periodically describe the scene without voice input (if AI_INTERVAL > 0)."""
    if AI_INTERVAL <= 0:
        print("[AI] Auto-describe disabled  (AI_INTERVAL=0)")
        return

    print(f"[AI] 🤖  Auto-describe every {AI_INTERVAL:.0f}s  lang={LANGUAGE}")
    while True:
        time.sleep(AI_INTERVAL)
        with frame_lock:
            frame_b64 = latest_frame_b64
        with gps_lock:
            gps = latest_gps or {}
        if not frame_b64:
            continue

        payload = {
            "deviceId":    DEVICE_ID,
            "userId":      USER_ID,
            "imageBase64": frame_b64,
            "prompt":      f"Describe the scene for navigation. Language: {LANGUAGE}",
            "mode":        "vision",
            "lat":         gps.get("lat", 0),
            "lng":         gps.get("lng", 0),
        }
        try:
            resp = requests.post(f"{SERVER_URL}/api/ai/describe", json=payload, timeout=15)
            if resp.ok:
                desc = resp.json().get("description", "")
                print(f"[AI] 💬  {desc[:120]}")
                speak(desc)
            else:
                print(f"[AI] ⚠️  HTTP {resp.status_code}")
        except requests.exceptions.Timeout:
            print("[AI] ⏱️  Timed out")
        except Exception as e:
            print(f"[AI] ❌  {e}")

# ── VOICE INTERACTION LOOP (Main) ─────────────────────────────────────────────

def voice_loop():
    """
    Continuous loop:
      1. Say 'Sollunga' prompt
      2. Record voice
      3. Detect mode from text
      4. Run local face rec or post to server
      5. Speak reply
    """
    speak("I am ready. Neenga pesa laam.")

    while True:
        try:
            speak("Sollunga")
            user_text = record_and_transcribe()
            if not user_text:
                user_text = "Describe scene"

            # Get latest frame for image analysis
            frame_bgr = None
            with frame_lock:
                if latest_frame_b64:
                    img_bytes = base64.b64decode(latest_frame_b64)
                    import numpy as np
                    arr = np.frombuffer(img_bytes, dtype=np.uint8)
                    frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)

            query_ai(user_text, frame_bgr)

        except Exception as e:
            print(f"⚠️  Voice loop error: {e}")
            time.sleep(1)

# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 62)
    print("  Aura Vision — Hardware Client")
    print(f"  SERVER     : {SERVER_URL}")
    print(f"  DEVICE_ID  : {DEVICE_ID}")
    print(f"  USER_ID    : {USER_ID}")
    print(f"  GPS        : {GPS_PORT} @ {GPS_BAUDRATE} baud  (every {GPS_EMIT_INTERVAL}s)")
    print(f"  STREAM     : {1/FRAME_INTERVAL:.0f} fps  JPEG Q={JPEG_QUALITY}  ({CAM_WIDTH}×{CAM_HEIGHT})")
    print(f"  LOCAL FACE : {'✅ Enabled' if FACE_RECOGNITION_AVAILABLE else '⚠️  Server-side only'}")
    print(f"  AI         : {'Auto every ' + str(AI_INTERVAL) + 's' if AI_INTERVAL > 0 else 'Voice-activated only'}")
    print("=" * 62)

    threads = [
        threading.Thread(target=video_stream_thread, daemon=True, name="VideoStream"),
        threading.Thread(target=gps_thread,          daemon=True, name="GPS"),
        threading.Thread(target=ai_describe_thread,  daemon=True, name="AI-Auto"),
        threading.Thread(target=voice_loop,          daemon=True, name="VoiceLoop"),
    ]
    for t in threads:
        t.start()
        print(f"[MAIN] ▶  Thread '{t.name}' started")

    # Main thread: manage Socket.IO connection (auto-reconnects)
    while True:
        try:
            print(f"\n[MAIN] Connecting to {SERVER_URL} …")
            sio.connect(SERVER_URL, transports=["websocket"])
            sio.wait()
        except socketio.exceptions.ConnectionError as ce:
            print(f"[MAIN] ⚠️  {ce} — retrying in 10 s …")
            time.sleep(10)
        except KeyboardInterrupt:
            print("\n[MAIN] Shutdown. Bye!")
            sio.disconnect()
            break
