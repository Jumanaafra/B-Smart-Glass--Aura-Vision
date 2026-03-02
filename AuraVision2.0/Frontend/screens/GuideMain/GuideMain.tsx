// screens/GuideMain/GuideMain.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { userAPI } from '../../utils/api';
import './GuideMain.css';

// Leaflet Icon Fix — use CDN URLs to avoid TypeScript PNG import errors
import L from 'leaflet';
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface GuideMainProps {
  setPage: (page: Page) => void;
}

// Map-ஐ புது லொகேஷனுக்கு நகர்த்தும் Component
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    // flyTo: ஸ்மூத்தா அந்த இடத்துக்கு ஜூம் ஆகி போகும்
    map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
  }, [lat, lng, map]);
  return null;
};

export const GuideMain: React.FC<GuideMainProps> = ({ setPage }) => {
  const [liveImage, setLiveImage] = useState<string | null>(null);
  // Default: Chennai (DB load aagura varaikum)
  const [liveLoc, setLiveLoc] = useState<{ lat: number, lng: number }>({ lat: 13.0827, lng: 80.2707 });

  const [socketStatus, setSocketStatus] = useState("Connecting...");
  const [isLive, setIsLive] = useState(false);

  const getUserDeviceId = () => {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr).deviceId : null;
  };

  useEffect(() => {
    const deviceId = getUserDeviceId();
    // In dev: connect to same origin (Vite proxy forwards /socket.io → localhost:5000)
    // In prod: VITE_BACKEND_URL points directly to the backend server
    const socketUrl = (import.meta as any).env?.VITE_BACKEND_URL || window.location.origin;
    const socket = io(socketUrl);

    // Load last known location from DB for this user
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      const currentUser = JSON.parse(userStr);
      userAPI.getProfile(currentUser._id)
        .then(res => res.json())
        .then(data => {
          if (!isLive && data.lastLocation?.lat && data.lastLocation?.lng) {
            setLiveLoc(data.lastLocation);
          }
        })
        .catch(err => console.error('Error fetching last location:', err));
    }

    socket.on('connect', () => { setSocketStatus("Connected 🟢"); });

    socket.on('receive-video-frame', (data) => {
      if (data.image) setLiveImage(data.image);
    });

    // 2. Live Location வந்தா உடனே அப்டேட் பண்ணு
    socket.on('receive-location', (data) => {
      if (data.lat && data.lng) {
        setLiveLoc(data);
        setIsLive(true);
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="gm-container">
      <header className="gm-header">
        <button onClick={() => setPage(Page.GUIDE_LOGIN)}><Icon name="arrowLeft" className="gm-back-button-icon" /></button>
        <div className="gm-header-info">
          <h1 className="gm-header-title">Monitoring Alex</h1>
          <div className="gm-status-badges">
            <span className="gm-badge" style={{ color: isLive ? '#4ade80' : '#fbbf24' }}>
              {isLive ? "📍 Live GPS" : "🕒 Last Known"}
            </span>
            <span className="gm-badge">{socketStatus}</span>
          </div>
        </div>
        <div className="gm-online-indicator-container"><div className={`gm-online-dot ${isLive ? 'pulse' : ''}`}></div></div>
      </header>

      <main className="gm-main">

        {/* 1. Live Video Section (Card Style) */}
        <div className="gm-section">
          <h2 className="gm-section-title">Live Vision</h2>
          <div className="gm-card">
            {liveImage ? (
              <img src={liveImage} className="gm-video" alt="Live" />
            ) : (
              <div className="gm-card-error">
                <Icon name="eyeSlash" className="gm-error-icon" />
                <p>Waiting for video feed...</p>
              </div>
            )}
            <div className="gm-live-tag">LIVE</div>
          </div>
        </div>

        {/* 2. Map Section (Same Size Card Style) */}
        <div className="gm-section">
          <h2 className="gm-section-title">Current Location</h2>
          <div className="gm-card map-card">
            {/* Zoom Control Enabled (zoomControl={true}) */}
            <MapContainer center={[liveLoc.lat, liveLoc.lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={true}>
              {/* OpenStreetMap (Standard) - ஊர் பெயர் தெளிவாக தெரியும் */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[liveLoc.lat, liveLoc.lng]}>
                <Popup className="custom-popup">User is here</Popup>
              </Marker>
              <RecenterMap lat={liveLoc.lat} lng={liveLoc.lng} />
            </MapContainer>
          </div>

          {/* Coordinates Display */}
          <div className="gm-address-box">
            <p><strong>Latitude:</strong> {liveLoc.lat.toFixed(6)}</p>
            <p><strong>Longitude:</strong> {liveLoc.lng.toFixed(6)}</p>
          </div>
        </div>

      </main>

      <footer className="gm-footer">
        <button className="gm-footer-button"><Icon name="microphone" className="gm-footer-icon" /><span>Speak</span></button>
        <button onClick={() => setPage(Page.GUIDE_AI_CHAT)} className="gm-footer-button"><Icon name="sparkles" className="gm-footer-icon" /><span>AI Chat</span></button>
        <button onClick={() => setPage(Page.ADD_PERSON)} className="gm-footer-button"><Icon name="userPlus" className="gm-footer-icon" /><span>Add Face</span></button>
        <button onClick={() => setPage(Page.HISTORY)} className="gm-footer-button"><Icon name="clock" className="gm-footer-icon" /><span>History</span></button>
      </footer>
    </div>
  );
};
