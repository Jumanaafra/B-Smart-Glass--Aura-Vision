// screens/VisuallyImpairedMain/VisuallyImpairedMain.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client"; // Socket Client
import './VisuallyImpairedMain.css';

interface VisuallyImpairedMainProps {
  setPage: (page: Page) => void;
}

export const VisuallyImpairedMain: React.FC<VisuallyImpairedMainProps> = ({ setPage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // UI States
  const [status, setStatus] = useState("Tap screen to ask...");
  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [userQuery, setUserQuery] = useState("");
  const [aiReply, setAiReply] = useState("");
  
  // Language State (Default: English)
  const [language, setLanguage] = useState<'EN' | 'TG'>('EN');

  // 1. DEFAULT BROWSER VOICE (ElevenLabs-க்கு பதில்)
  const speak = (text: string) => {
    window.speechSynthesis.cancel(); // பழைய பேச்சை நிறுத்து
    const utterance = new SpeechSynthesisUtterance(text);
    
    // இந்தியன் இங்கிலீஷ் வாய்ஸ் இருக்கானு தேடுறோம் (Tanglish நல்லா இருக்கும்)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('IN') || v.name.includes('India')) || voices.find(v => v.lang.includes('US'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 0.9; // கொஞ்சம் மெதுவாக
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setAiSpeaking(true);
    utterance.onend = () => setAiSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // 2. Socket Connect & Camera Start (Immediately)
  useEffect(() => {
    const newSocket = io("https://b-smart-glass-aura-vision.onrender.com");
    setSocket(newSocket);

    const startCamera = async () => {
      try {
        // மொபைலுக்காக பின்பக்க கேமரா
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        } catch (e) {
            // லேப்டாப்பில் அது இல்லையென்றால், சாதாரண கேமரா
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (videoRef.current) videoRef.current.srcObject = stream;
        
        // குறிப்பு: ஆப் ஓபன் ஆன உடனே வாய்ஸ் வராது (Browser Policy). 
        // நீங்க ஸ்கிரீனை தொட்ட பிறகு தான் பேச ஆரம்பிக்கும்.
        speak("I am ready."); 
      } catch (err) {
        console.error("Camera Error:", err);
        setStatus("Camera Error 🔴");
        speak("Camera error.");
      }
    };
    startCamera();

    return () => { newSocket.close(); };
  }, []);

  // 3. Live Stream Loop (Fast Video)
  useEffect(() => {
    if (!socket) return;
    
    const interval = setInterval(() => {
      if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth / 2;
        canvas.height = videoRef.current.videoHeight / 2;
        const ctx = canvas.getContext('2d');
        if(ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.5);
            socket.emit('send-video-frame', { image: imageBase64 });
            
             navigator.geolocation.getCurrentPosition((pos) => {
                socket.emit('send-location', { lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, () => {}, {enableHighAccuracy: true});
        }
      }
    }, 200); 

    return () => clearInterval(interval);
  }, [socket]);

  // 4. Language Toggle
  const toggleLanguage = (e: React.MouseEvent) => {
      e.stopPropagation(); 
      const newLang = language === 'EN' ? 'TG' : 'EN';
      setLanguage(newLang);
      speak(newLang === 'TG' ? "Tanglish mode on" : "English mode on");
  };

  // 5. Voice Input
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
    recognition.lang = 'en-US'; 
    recognition.start();
    setIsListening(true);
    setStatus(language === 'TG' ? "Kelunga... (Listening) 🎤" : "Listening... 🎤");

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
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

  // 6. AI Process
  const analyzeImage = async (query: string) => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.6);

    setStatus(language === 'TG' ? "Yosikkiren... 🧠" : "Thinking... 🧠");
    
    try {
      const response = await fetch('https://b-smart-glass-aura-vision.onrender.com/api/ai/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, prompt: query, language }),
      });

      const data = await response.json();
      const reply = data.description || "Server Error.";
      
      setAiReply(reply);
      setStatus(language === 'TG' ? "Badhil vandhuchu ✅" : "Done ✅");
      speak(reply); // Browser Voice-ல் பேசும்

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
            <button onClick={toggleLanguage} className="vim-lang-button">
                {language}
            </button>
            <div onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setPage(Page.SETTINGS)}><Icon name="settings" className="vim-icon-settings"/></button>
            </div>
        </div>
      </header>

      <div className="vision-active-container">
        <video ref={videoRef} autoPlay playsInline muted className="vision-active-bg-img" />
        
        <div className="vim-status-box">
            <p>{status}</p>
        </div>

        {isListening && (
            <div className="vision-active-overlay">
                <p className="vision-active-text">Listening...</p>
            </div>
        )}
        
         {aiSpeaking && !isListening && (
             <div className="vision-active-overlay" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                <p className="vision-active-text">Speaking...</p>
            </div>
        )}
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
