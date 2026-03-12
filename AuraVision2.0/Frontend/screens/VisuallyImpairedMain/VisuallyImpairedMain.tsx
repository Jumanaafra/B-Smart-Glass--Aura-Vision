// screens/VisuallyImpairedMain/VisuallyImpairedMain.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client";
import { aiAPI } from '../../utils/api';
import './VisuallyImpairedMain.css';

interface VisuallyImpairedMainProps {
  setPage: (page: Page) => void;
}

export const VisuallyImpairedMain: React.FC<VisuallyImpairedMainProps> = ({ setPage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const fallTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // FIX: Always-current socket ref prevents stale-closure bugs in async callbacks
  const socketRef = useRef<any>(null);
  // FIX: Guard vi-ready until after join-room is confirmed
  const roomJoinedRef = useRef(false);

  const [status, setStatus] = useState("Tap screen to ask...");
  const [gpsStatus, setGpsStatus] = useState("Waiting for GPS...");

  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [userQuery, setUserQuery] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [language, setLanguage] = useState<'EN' | 'TG'>('EN');
  const [fallDetectionEnabled, setFallDetectionEnabled] = useState(false);

  // User Device ID-ஐ LocalStorage-ல் இருந்து எடுக்குறோம்
  const getUserDeviceId = () => {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr).deviceId : null;
  };

  useEffect(() => {
    // In dev: connect to same origin (Vite proxy forwards /socket.io → localhost:5000)
    // In prod: VITE_BACKEND_URL points directly to the backend server
    const socketUrl = (import.meta as any).env?.VITE_BACKEND_URL || window.location.origin;
    const newSocket = io(socketUrl);
    // FIX: Keep socketRef always in sync so async callbacks never capture a stale null
    socketRef.current = newSocket;
    setSocket(newSocket);
    const deviceId = getUserDeviceId();

    newSocket.on('connect', () => {
      newSocket.emit('join-room', deviceId);
      // FIX: Mark room as joined, then start camera — guarantees vi-ready fires
      // only after the server has processed join-room for this socket
      roomJoinedRef.current = true;
      startCamera();
    });

    if ("geolocation" in navigator) {
      setGpsStatus("Requesting Permission...");

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setGpsStatus(`GPS Active: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

          // இங்கே Device ID-யையும் சேர்த்து அனுப்புகிறோம்
          newSocket.emit('send-location', {
            lat: latitude,
            lng: longitude,
            deviceId: deviceId
          });
        },
        (error) => {
          console.error("Location Error:", error);
          if (error.code === 1) setGpsStatus("GPS Error: Permission Denied");
          else setGpsStatus("GPS Error: Signal Unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
        roomJoinedRef.current = false;
        newSocket.disconnect();
      };
    } else {
      setGpsStatus("Geolocation Not Supported");
      return () => {
        roomJoinedRef.current = false;
        newSocket.disconnect();
      };
    }
  }, []);

  // FIX: startCamera is now a stable function (not inside a useEffect) so it can be
  // called from the on('connect') handler after join-room is confirmed.
  // socketRef.current is used instead of the socket state to avoid stale closures.
  const startCamera = async () => {
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (videoRef.current) videoRef.current.srcObject = stream;
      speak("I am ready.");
      // FIX: Only emit vi-ready after room is confirmed joined, using the live ref
      if (socketRef.current && roomJoinedRef.current) {
        socketRef.current.emit('vi-ready');
      }
    } catch (err) {
      setStatus("Camera Error 🔴");
      speak("Camera error.");
    }
  };

  // --- WebRTC Broadcaster Setup ---
  useEffect(() => {
    if (!socket) return;
    // FIX: Capture the socket ref value at effect-run time for use in cleanup,
    // guaranteeing the teardown always removes listeners from the correct socket
    const activeSocket = socketRef.current;

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const setupRTC = () => {
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      const pc = new RTCPeerConnection(configuration);
      peerConnectionRef.current = pc;

      // Attach the live camera stream tracks to the WebRTC connection
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      }

      // FIX: Use activeSocket (captured ref) to ensure ICE candidates use the live socket
      pc.onicecandidate = (event) => {
        if (event.candidate && activeSocket) activeSocket.emit('webrtc-candidate', event.candidate);
      };

      return pc;
    };

    // Queue for ICE candidates that arrive before remote description is set
    const candidatesQueue: RTCIceCandidateInit[] = [];

    // 1. Guide requests connection -> We generate an Offer
    const handleRequestWebRTC = async () => {
      const pc = setupRTC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (activeSocket) activeSocket.emit('webrtc-offer', offer);
    };

    // 2. Guide sends Answer back
    const handleWebRTCAnswer = async (answer: RTCSessionDescriptionInit) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        // Flush queue
        while (candidatesQueue.length > 0) {
          const candidate = candidatesQueue.shift();
          if (candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      }
    };

    // 3. Guide sends ICE Candidates
    const handleWebRTCCandidate = async (candidate: RTCIceCandidateInit) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        if (peerConnectionRef.current.remoteDescription) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          candidatesQueue.push(candidate);
        }
      }
    };

    socket.on('request-webrtc', handleRequestWebRTC);
    socket.on('webrtc-answer', handleWebRTCAnswer);
    socket.on('webrtc-candidate', handleWebRTCCandidate);

    return () => {
      // FIX: Use activeSocket so cleanup always targets the right socket instance
      if (activeSocket) {
        activeSocket.off('request-webrtc', handleRequestWebRTC);
        activeSocket.off('webrtc-answer', handleWebRTCAnswer);
        activeSocket.off('webrtc-candidate', handleWebRTCCandidate);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [socket]);

  // --- Fall Detection using DeviceMotionEvent ---
  useEffect(() => {
    if (!fallDetectionEnabled || !socket) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity) return;

      const { x, y, z } = event.accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      const acceleration = Math.sqrt(x * x + y * y + z * z);

      // Ambient gravity is ~9.8 m/s^2. A hard impact spikes well above 20 m/s^2.
      if (acceleration > 20) {
        if (fallTimeoutRef.current) return;

        console.warn("FALL DETECTED!", acceleration);
        socket.emit('sos-alert', {
          deviceId: getUserDeviceId()
        });

        speak(language === 'TG' ? "Thavidaama erunga. SOS anupiyachu." : "Fall impact detected. SOS sent to guide.");

        // Cooldown of 10 seconds to prevent alert spam
        fallTimeoutRef.current = setTimeout(() => {
          fallTimeoutRef.current = null;
        }, 10000);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [fallDetectionEnabled, socket, language]);

  const enableFallDetection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        if (permission === 'granted') {
          setFallDetectionEnabled(true);
          speak(language === 'TG' ? "Mullu paadhukaappu on" : "SOS Fall detection enabled");
        }
      } catch (err) {
        console.error('Fall Detection Permission Error:', err);
      }
    } else {
      setFallDetectionEnabled(true);
      speak(language === 'TG' ? "Mullu paadhukaappu on" : "SOS Fall detection enabled");
    }
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('IN') || v.name.includes('India')) || voices.find(v => v.lang.includes('US'));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const toggleLanguage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newLang = language === 'EN' ? 'TG' : 'EN';
    setLanguage(newLang);
    speak(newLang === 'TG' ? "Tanglish mode on" : "English mode on");
  };

  const startListening = () => {
    if (isListening || aiSpeaking) {
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported. Use Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'TG' ? 'ta-IN' : 'en-US'; // Set recognition language
    recognition.start();
    setIsListening(true);
    setStatus(language === 'TG' ? "Kelunga... (Listening) 🎤" : "Listening... 🎤");

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setUserQuery(`"${transcript}"`);
      setIsListening(false);
      await analyzeImage(transcript);
    };
    recognition.onerror = () => {
      setStatus("Try again.");
      speak("I didn't catch that.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
  };

  const analyzeImage = async (query: string) => {
    // ─── MODE DETECTION ──────────────────────────────────────────────────────
    // Priority order: FACE > OCR > VISION > CHAT
    // "vision" is the default fallback since VI users almost always need
    // camera context. Pure text chat is only triggered by explicit chat words.

    const FACE_KEYWORDS = [
      // English — identity
      "who", "who is", "who's", "identify", "recognize", "recognition",
      "know this person", "know him", "know her", "do i know",
      "have we met", "name of this person", "tell me who",
      // English — body/face
      "face", "person", "people", "man", "woman", "boy", "girl",
      "someone", "anyone", "anybody", "someone here", "standing",
      // Tamil/Tanglish
      "yaar", "yaaru", "evan", "ivan", "ival", "ever", "avar",
      "mugam", "aalu", "aval", "paathirukkiya", "theriyuma",
      "theriyudha", "yaarunu", "ithu yaar",
    ];

    const OCR_KEYWORDS = [
      // English — reading
      "read", "reading", "what does it say", "what does this say",
      "read this", "tell me what's written", "what is written",
      "text", "writing", "written", "letters", "words", "number",
      "sign", "label", "notice", "display", "screen", "caption",
      // Specific document types
      "paper", "document", "page", "bill", "receipt", "invoice",
      "menu", "board", "banner", "poster", "letter", "envelope",
      "book", "magazine", "newspaper", "article",
      "price", "amount", "cost", "total",
      // Tamil/Tanglish
      "padi", "padikka", "ezhuthu", "enna ezhuthirukku",
      "enna sollutu irukku", "board la enna", "paper la enna",
    ];

    const VISION_KEYWORDS = [
      // English — general scene
      "what", "where am i", "what is this", "what's this", "what's in front",
      "what's around", "what's here", "what's there", "what do you see",
      "describe", "description", "explain", "tell me about",
      "look", "see", "check", "scan", "analyze", "analyse", "inspect",
      "show", "find", "spot", "notice", "observe",
      // Environment
      "surroundings", "around me", "near me", "in front", "ahead",
      "background", "scene", "area", "place", "location", "room",
      "road", "path", "obstacle", "danger", "safe", "clear",
      "colour", "color", "shape", "size", "big", "small",
      // Objects
      "object", "thing", "item", "stuff", "this", "that",
      "door", "stairs", "car", "vehicle", "table", "chair",
      "photo", "image", "picture", "camera",
      // Tamil/Tanglish
      "paar", "paaru", "munnadi", "enna irukku", "enna irukkuthu",
      "enna pakka mudiyuthu", "enna theriyuthu", "ithu enna",
      "idhu enna", "solla", "sollungo", "describe pannu",
      "irukku", "irukka", "pathu sollu", "surrounding",
    ];

    const CHAT_KEYWORDS = [
      // Pure conversational — no camera needed
      "hello", "hi", "hey", "how are you", "good morning", "good night",
      "thank you", "thanks", "okay", "alright", "yes", "no",
      "tell me a joke", "joke", "story", "chat", "talk",
      "what time", "what day", "what date", "today", "tomorrow",
      "help", "emergency", "call", "phone",
      "weather", "temperature", "news",
      // Tamil/Tanglish
      "vanakkam", "nandri", "sari", "aamam", "illai",
      "eppadi irukeenga", "eppadi irukkeenga", "kaalam",
    ];

    // Check in priority order: FACE first, then OCR, then VISION, then CHAT
    let mode = "vision"; // DEFAULT: camera context is almost always needed for VI users

    // 1. FACE — most specific intent
    for (const word of FACE_KEYWORDS) {
      if (query.includes(word)) { mode = "face"; break; }
    }
    // 2. OCR — text reading intent
    if (mode === "vision") {
      for (const word of OCR_KEYWORDS) {
        if (query.includes(word)) { mode = "ocr"; break; }
      }
    }
    // 3. VISION — general scene (already default, but explicit keywords confirm it)
    // 4. CHAT — only if query matches pure conversational words AND nothing else matched
    if (mode === "vision") {
      const isChatOnly = CHAT_KEYWORDS.some(word => query.includes(word));
      // Only switch to chat if it's a chat keyword AND no vision words are in the query
      const hasVisionWord = VISION_KEYWORDS.some(word => query.includes(word));
      if (isChatOnly && !hasVisionWord) {
        mode = "chat";
      }
    }

    let imageBase64 = null;

    // --- OPTIMIZATION: Only grab image if needed ---
    if (mode === 'vision' || mode === 'face' || mode === 'ocr') {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      imageBase64 = canvas.toDataURL('image/jpeg', 0.6);
    }

    const userStr = localStorage.getItem('currentUser');
    const userId = userStr ? JSON.parse(userStr)._id : '';

    setStatus(language === 'TG' ? "Yosikkiren... 🧠" : "Thinking... 🧠");
    try {
      const response = await aiAPI.processImage(imageBase64, query, userId, language, mode);
      const data = await response.json();
      setAiReply(data.description || "Server Error.");
      setStatus(language === 'TG' ? "Badhil vandhuchu ✅" : "Done ✅");
      speak(data.description);
    } catch (error) {
      setStatus("Connection Error ❌");
      speak("Internet error.");
    }
  };

  return (
    <div className="vim-container" onClick={startListening}>
      <header className="vim-header">
        <h1 className="vim-header-title">IRIS Assistant</h1>
        <div className="vim-header-actions">
          {!fallDetectionEnabled ? (
            <button onClick={enableFallDetection} className="vim-lang-button" style={{ background: '#ef4444', color: 'white', border: 'none' }}>SOS Off</button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setFallDetectionEnabled(false); }} className="vim-lang-button" style={{ background: '#10b981', color: 'white', border: 'none' }}>SOS On</button>
          )}
          <button onClick={toggleLanguage} className="vim-lang-button">{language}</button>
          <div onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPage(Page.SETTINGS)}><Icon name="settings" className="vim-icon-settings" /></button>
          </div>
        </div>
      </header>
      <div className="vision-active-container">
        <video ref={videoRef} autoPlay playsInline muted className="vision-active-bg-img" />
        <div className="vim-status-box" style={{ bottom: '60px' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', color: gpsStatus.includes('Active') ? '#4ade80' : '#f87171' }}>📍 {gpsStatus}</p>
          <p style={{ margin: 0, marginTop: '5px' }}>{status}</p>
        </div>
        {isListening && <div className="vision-active-overlay"><p className="vision-active-text">Listening...</p></div>}
        {aiSpeaking && !isListening && <div className="vision-active-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}><p className="vision-active-text">Speaking...</p></div>}
      </div>
      <div className="vim-conversation-box">
        <p className="vim-user-text">{userQuery}</p>
        <p className="vim-ai-text">{aiReply}</p>
      </div>
      <footer className="vim-footer">
        <div className="footer-content">
          <button className={`speak-button ${isListening ? 'speak-button-listening' : 'speak-button-default'}`}>
            <Icon name="microphone" className="speak-button-icon" />
          </button>
          <p className="speak-button-label">Tap to Speak</p>
        </div>
      </footer>
    </div>
  );
};
