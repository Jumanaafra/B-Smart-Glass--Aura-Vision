import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

export const GuideMain: React.FC<GuideMainProps> = ({ setPage }) => {
  const [liveImage, setLiveImage] = useState<string | null>(null);
  // Default Location (Chennai) - GPS வரவில்லை என்றால் இது தெரியும்
  const [liveLoc, setLiveLoc] = useState<{lat: number, lng: number}>({lat: 13.0827, lng: 80.2707});
  const [status, setStatus] = useState("Connecting...");
  const [hasReceivedLoc, setHasReceivedLoc] = useState(false);

  useEffect(() => {
    const socket = io("https://b-smart-glass-aura-vision.onrender.com");

    socket.on('connect', () => { setStatus("Connected 🟢"); });
    
    socket.on('receive-video-frame', (data) => {
        if (data.image) setLiveImage(data.image);
    });

    socket.on('receive-location', (data) => {
        if (data.lat && data.lng) {
            setLiveLoc(data);
            setHasReceivedLoc(true);
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
                {hasReceivedLoc ? "Live GPS Active 🟢" : "Waiting for GPS 🟠"}
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
             <MapContainer center={[liveLoc.lat, liveLoc.lng]} zoom={15} style={{ height: '100%', width: '100%' }} key={`${liveLoc.lat}-${liveLoc.lng}`}>
                 <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                 <Marker position={[liveLoc.lat, liveLoc.lng]}>
                   <Popup>User is here</Popup>
                 </Marker>
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
