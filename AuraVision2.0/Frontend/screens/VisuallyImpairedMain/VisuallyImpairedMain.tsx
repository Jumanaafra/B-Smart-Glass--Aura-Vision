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

  const [status, setStatus] = useState("Tap screen to ask...");
  const [gpsStatus, setGpsStatus] = useState("Waiting for GPS...");

  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [userQuery, setUserQuery] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [language, setLanguage] = useState<'EN' | 'TG'>('EN');

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
    setSocket(newSocket);
    const deviceId = getUserDeviceId();

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
        newSocket.disconnect();
      };
    } else {
      setGpsStatus("Geolocation Not Supported");
      return () => newSocket.disconnect();
    }
  }, []);

  useEffect(() => {
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
      } catch (err) {
        setStatus("Camera Error 🔴");
        speak("Camera error.");
      }
    };
    startCamera();
  }, []);

  // Live Video Loop (Balanced Settings: 120ms, 0.6 Quality)
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth / 2;
        canvas.height = videoRef.current.videoHeight / 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageBase64 = canvas.toDataURL('image/webp', 0.6);
          socket.emit('send-video-frame', { image: imageBase64 });
        }
      }
    }, 120);
    return () => clearInterval(interval);
  }, [socket]);

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
    // --- MODE DETECTION ---
    const VISION_KEYWORDS = ["look", "see", "what is this", "describe", "paar", "munnadi", "photo", "image", "enna", "irukku"];
    const FACE_KEYWORDS = ["who", "yaar", "face", "mugam", "person", "aalu", "ivan"];

    let mode = "chat";
    for (const word of VISION_KEYWORDS) {
      if (query.includes(word)) { mode = "vision"; break; }
    }
    for (const word of FACE_KEYWORDS) {
      if (query.includes(word)) { mode = "face"; break; }
    }

    let imageBase64 = null;

    // --- OPTIMIZATION: Only grab image if needed ---
    if (mode === 'vision' || mode === 'face') {
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
