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

// Recenter Map Component
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]); 
  }, [lat, lng, map]);
  return null;
};

export const GuideMain: React.FC<GuideMainProps> = ({ setPage }) => {
  const [liveImage, setLiveImage] = useState<string | null>(null);
  const [liveLoc, setLiveLoc] = useState<{lat: number, lng: number}>({lat: 13.0827, lng: 80.2707});
  const [status, setStatus] = useState("Connecting...");
  const [hasReceivedLoc, setHasReceivedLoc] = useState(false);

  // User Device ID-ஐ எடுக்குறோம்
  const getUserDeviceId = () => {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr).deviceId : null;
  };

  useEffect(() => {
    const deviceId = getUserDeviceId();
    const socket = io("https://b-smart-glass-aura-vision.onrender.com");

    // 1. ஆப் ஓபன் ஆனதும், Database-ல் இருந்து கடைசி லொகேஷனை எடு
    if (deviceId) {
        fetch(`https://b-smart-glass-aura-vision.onrender.com/api/location/${deviceId}`)
            .then(res => res.json())
            .then(data => {
                if (data.lat && data.lng) {
                    setLiveLoc(data);
                    setHasReceivedLoc(false); // Live ஆக வரும் வரை ஆரஞ்சு கலர்
                }
            })
            .catch(err => console.error("Error fetching last location:", err));
    }

    socket.on('connect', () => { setStatus("Connected 🟢"); });
    
    socket.on('receive-video-frame', (data) => {
        if (data.image) setLiveImage(data.image);
    });

    // 2. லைவ் லொகேஷன் வந்தால் அப்டேட் செய்
    socket.on('receive-location', (data) => {
        if (data.lat && data.lng) {
            setLiveLoc(data);
            setHasReceivedLoc(true); // Live Active (Green)
        }
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="gm-container">
      <header className="gm-header">
        <button onClick={() => setPage(Page.GUIDE_LOGIN)}><Icon name="arrowLeft" className="gm-back-button-icon" /></button>
        <div>
            <h1 className="gm-header-title">Monitoring Alex</h1>
            <p style={{fontSize: '0.7rem', color: hasReceivedLoc ? '#4ade80' : '#fbbf24', margin: 0}}>
                {hasReceivedLoc ? "Live GPS Active 🟢" : "Last Known Location 🟠"}
            </p>
        </div>
        <div className="gm-online-indicator-container"><div className="gm-online-dot"></div></div>
      </header>

      <main className="gm-main">
        <div>
          <h2 className="gm-section-title">Live Feed</h2>
          <div className="gm-card" style={{ height: '250px' }}>
             {liveImage ? (
                <img src={liveImage} className="gm-video" alt="Live" />
             ) : (
                <div className="gm-card-error"><p>Waiting for video...</p></div>
             )}
          </div>
        </div>
        
        <div>
          <h2 className="gm-section-title">Real-time Location</h2>
          <div className="gm-card" style={{ height: '300px', padding: 0, overflow: 'hidden' }}>
             <MapContainer center={[liveLoc.lat, liveLoc.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                 <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                 <Marker position={[liveLoc.lat, liveLoc.lng]}>
                   <Popup>User is here</Popup>
                 </Marker>
                 <RecenterMap lat={liveLoc.lat} lng={liveLoc.lng} />
             </MapContainer>
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
