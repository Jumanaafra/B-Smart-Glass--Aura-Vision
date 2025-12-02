// screens/GuideMain/GuideMain.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './GuideMain.css';

// Leaflet Icon Fix
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

interface GuideMainProps {
  setPage: (page: Page) => void;
}

// Map-ஐ புது லொகேஷனுக்கு நகர்த்தும் Component
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    // flyTo பயன்படுத்தினால் Smooth-ஆக பறந்து செல்லும் (Nature map-க்கு இது கெத்தா இருக்கும்)
    map.flyTo([lat, lng], 18, { animate: true, duration: 1.5 }); 
  }, [lat, lng, map]);
  return null;
};

export const GuideMain: React.FC<GuideMainProps> = ({ setPage }) => {
  const [liveImage, setLiveImage] = useState<string | null>(null);
  // Default: Chennai (DB load aagura varaikum)
  const [liveLoc, setLiveLoc] = useState<{lat: number, lng: number}>({lat: 13.0827, lng: 80.2707});
  
  // Status States
  const [socketStatus, setSocketStatus] = useState("Connecting...");
  const [isLive, setIsLive] = useState(false); // Live data varudha illaya nu check panna

  const getUserDeviceId = () => {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr).deviceId : null;
  };

  useEffect(() => {
    const deviceId = getUserDeviceId();
    const socket = io("https://b-smart-glass-aura-vision.onrender.com");

    // 1. எடுத்த உடனே DB-ல இருந்து Last Location-ஐ கொண்டு வா (Offline Support)
    if (deviceId) {
        fetch(`https://b-smart-glass-aura-vision.onrender.com/api/location/${deviceId}`)
            .then(res => res.json())
            .then(data => {
                // Live location இன்னும் வரலனா மட்டும் DB location-ஐ செட் பண்ணு
                if (!isLive && data.lat && data.lng) {
                    setLiveLoc(data);
                }
            })
            .catch(err => console.error("Error fetching last location:", err));
    }

    socket.on('connect', () => { setSocketStatus("Connected 🟢"); });
    
    socket.on('receive-video-frame', (data) => {
        if (data.image) setLiveImage(data.image);
    });

    // 2. Live Location வரும்போது இதை அப்டேட் செய்
    socket.on('receive-location', (data) => {
        if (data.lat && data.lng) {
            setLiveLoc(data);
            setIsLive(true); // Live Data வர ஆரம்பிச்சுடுச்சு!
        }
    });

    return () => { socket.disconnect(); };
  }, []); // Run once

  return (
    <div className="gm-container">
      <header className="gm-header">
        <button onClick={() => setPage(Page.GUIDE_LOGIN)}><Icon name="arrowLeft" className="gm-back-button-icon" /></button>
        <div className="gm-header-info">
            <h1 className="gm-header-title">Monitoring Alex</h1>
            <div className="gm-status-badges">
                <span className="gm-badge" style={{color: isLive ? '#4ade80' : '#fbbf24'}}>
                    {isLive ? "📍 Live GPS" : "🕒 Last Known"}
                </span>
                <span className="gm-badge">{socketStatus}</span>
            </div>
        </div>
        <div className="gm-online-indicator-container"><div className={`gm-online-dot ${isLive ? 'pulse' : ''}`}></div></div>
      </header>

      <main className="gm-main">
        {/* Live Video Section */}
        <div className="gm-video-section">
          <div className="gm-card">
             {liveImage ? (
                <img src={liveImage} className="gm-video" alt="Live" />
             ) : (
                <div className="gm-card-error">
                    <Icon name="eyeSlash" className="gm-error-icon"/>
                    <p>Waiting for video feed...</p>
                </div>
             )}
             <div className="gm-live-tag">LIVE VIEW</div>
          </div>
        </div>
        
        {/* Map Section (Full Remaining Height) */}
        <div className="gm-map-section">
             <MapContainer center={[liveLoc.lat, liveLoc.lng]} zoom={18} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                 {/* Nature / Satellite Map Design (Esri World Imagery) */}
                 <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; Esri'
                 />
                 {/* Street Labels Overlay (Optional - Roads தெரிய) */}
                 <TileLayer 
                    url="https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lines/{z}/{x}/{y}{r}.png"
                    opacity={0.4} 
                 />
                 
                 <Marker position={[liveLoc.lat, liveLoc.lng]}>
                   <Popup className="custom-popup">User is here</Popup>
                 </Marker>
                 <RecenterMap lat={liveLoc.lat} lng={liveLoc.lng} />
             </MapContainer>
             <div className="gm-map-overlay-info">
                <p>Lat: {liveLoc.lat.toFixed(5)}</p>
                <p>Lng: {liveLoc.lng.toFixed(5)}</p>
             </div>
        </div>
      </main>
      
      <footer className="gm-footer">
          <button className="gm-footer-button"><Icon name="microphone" className="gm-footer-icon"/><span>Speak</span></button>
          <button onClick={() => setPage(Page.GUIDE_AI_CHAT)} className="gm-footer-button"><Icon name="sparkles" className="gm-footer-icon"/><span>AI Chat</span></button>
          <button onClick={() => setPage(Page.ADD_PERSON)} className="gm-footer-button"><Icon name="userPlus" className="gm-footer-icon"/><span>Add Face</span></button>
          <button onClick={() => setPage(Page.HISTORY)} className="gm-footer-button"><Icon name="clock" className="gm-footer-icon"/><span>History</span></button>
      </footer>
    </div>
  );
};
