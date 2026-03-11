// screens/GuideMain/GuideMain.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
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
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerConnectionRef = React.useRef<RTCPeerConnection | null>(null);
  const isLiveRef = React.useRef(false);

  // Default to null: we load DB location first, then live updates override it
  const [liveLoc, setLiveLoc] = useState<{ lat: number, lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(true);

  const [socketStatus, setSocketStatus] = useState("Connecting...");
  const [isLive, setIsLive] = useState(false);
  const [mapType, setMapType] = useState<'normal' | 'satellite'>('satellite');
  const [address, setAddress] = useState<string>("Fetching location name...");

  const [safeZone, setSafeZone] = useState<{ lat: number, lng: number, radiusInMeters: number, enabled: boolean } | null>(null);
  const [safeZoneRadius, setSafeZoneRadius] = useState<number>(500);
  const [alert, setAlert] = useState<{ type: 'SOS' | 'GEOFENCE', message: string, lat?: number, lng?: number, distance?: number } | null>(null);

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

    // Load last known location from DB for this user's connected VI
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      userAPI.getConnectedVI()
        .then(res => {
          if (!res.ok) throw new Error('Connected VI user not found');
          return res.json();
        })
        .then(data => {
          localStorage.setItem('connectedVIId', data._id);
          // Always load DB location on mount. If live location arrives later, it will override.
          if (!isLiveRef.current && data.lastLocation?.lat && data.lastLocation?.lng) {
            setLiveLoc(data.lastLocation);
            fetchAddress(data.lastLocation.lat, data.lastLocation.lng);
          }
          setLocLoading(false);
          if (data.safeZone) {
            setSafeZone(data.safeZone);
            if (data.safeZone.radiusInMeters) setSafeZoneRadius(data.safeZone.radiusInMeters);
          }
        })
        .catch(err => {
          console.error('Error fetching connected VI last location:', err);
          setLocLoading(false);
        });
    } else {
      setLocLoading(false);
    }

    socket.on('connect', () => {
      setSocketStatus("Connected 🟢");
      socket.emit('join-room', deviceId);
      // Ask visually impaired unit to start WebRTC process
      socket.emit('request-webrtc');
    });

    // --- WebRTC Receiver Setup ---
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const setupRTC = () => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      const pc = new RTCPeerConnection(configuration);
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc-candidate', event.candidate);
      };

      return pc;
    };

    socket.on('webrtc-offer', async (offer) => {
      const pc = setupRTC();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', answer);
    });

    socket.on('webrtc-candidate', async (candidate) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // VI signals it's ready with camera stream — immediately request WebRTC
    socket.on('vi-ready', () => {
      console.log('VI is ready! Requesting WebRTC...');
      // Close any stale connection first
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // Re-request WebRTC offer from the VI
      socket.emit('request-webrtc');
    });

    // 2. Live Location update received
    socket.on('receive-location', (data) => {
      if (data.lat && data.lng) {
        isLiveRef.current = true;
        setLiveLoc(data);
        fetchAddress(data.lat, data.lng);
        setIsLive(true);
        setLocLoading(false);
      }
    });

    socket.on('geofence-alert', (data) => {
      setAlert({
        type: 'GEOFENCE',
        message: `User has exited the safe zone! (${data.distance}m away from the zone center)`,
        lat: data.lat,
        lng: data.lng
      });
    });

    socket.on('sos-alert', (data) => {
      setAlert({
        type: 'SOS',
        message: 'EMERGENCY: Fall Detected or SOS Triggered!',
        lat: data.lat,
        lng: data.lng
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  const handleSaveSafeZone = async (enabled: boolean) => {
    const viId = localStorage.getItem('connectedVIId');
    if (!viId) {
      window.alert('Connected VI user ID not found. Please refresh the page.');
      return;
    }

    const newZone = {
      lat: liveLoc.lat,
      lng: liveLoc.lng,
      radiusInMeters: safeZoneRadius,
      enabled: enabled
    };

    setSafeZone(newZone);
    try {
      await userAPI.updateSafeZone(viId, newZone);
      if (enabled) {
        window.alert(`Safe Zone enabled! Radius: ${safeZoneRadius}m`);
      } else {
        window.alert('Safe Zone disabled.');
      }
    } catch (err) {
      console.error('Failed to update safe zone', err);
    }
  };

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      setAddress(data.display_name || "Unknown Location");
    } catch (e) {
      setAddress("Name unavailable");
    }
  };

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
          <h2 className="gm-section-title">Live Vision (WebRTC)</h2>
          <div className="gm-card">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted // Mute Guide's feedback loop
              className="gm-video"
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
            <div className="gm-live-tag">LIVE</div>
          </div>
        </div>

        {/* 2. Map Section (Same Size Card Style) */}
        <div className="gm-section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="gm-section-title" style={{ marginBottom: 0 }}>Location & Safe Zone</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setMapType('normal')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #ccc', background: mapType === 'normal' ? '#007aff' : '#fff', color: mapType === 'normal' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  Normal
                </button>
                <button
                  onClick={() => setMapType('satellite')}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #ccc', background: mapType === 'satellite' ? '#007aff' : '#fff', color: mapType === 'satellite' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  Satellite
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Ring Radius (m):</span>
              <input
                type="number"
                value={safeZoneRadius}
                onChange={(e) => setSafeZoneRadius(Number(e.target.value))}
                style={{ width: '70px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <button onClick={() => handleSaveSafeZone(true)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Drop Safe Zone Ring Here</button>
              {safeZone?.enabled && <button onClick={() => handleSaveSafeZone(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Turn Off</button>}
            </div>
          </div>
          <div className="gm-card map-card">
            {/* Zoom Control Enabled (zoomControl={true}) */}
            {locLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>Loading last known location...</div>
            ) : liveLoc ? (
              <MapContainer center={[liveLoc.lat, liveLoc.lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={true}>
                {mapType === 'satellite' ? (
                  <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                ) : (
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}

                <Marker position={[liveLoc.lat, liveLoc.lng]}>
                  <Popup className="custom-popup">User is here</Popup>
                </Marker>

                {safeZone && safeZone.enabled && safeZone.lat && safeZone.lng && (
                  <Circle
                    center={[safeZone.lat, safeZone.lng]}
                    radius={safeZone.radiusInMeters}
                    pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.2, weight: 2 }}
                  />
                )}

                <RecenterMap lat={liveLoc.lat} lng={liveLoc.lng} />
              </MapContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>No location data yet. Waiting for VI user...</div>
            )}
          </div>

          {/* Coordinates & Address Display */}
          <div className="gm-address-box">
            {liveLoc && (
              <div style={{ display: 'flex', gap: '30px' }}>
                <p><strong>Latitude:</strong> {liveLoc.lat.toFixed(6)}</p>
                <p><strong>Longitude:</strong> {liveLoc.lng.toFixed(6)}</p>
              </div>
            )}
            <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#555' }}>
              <strong>Location:</strong> {address}
            </p>
          </div>
        </div>

      </main>

      <footer className="gm-footer">
        <button className="gm-footer-button"><Icon name="microphone" className="gm-footer-icon" /><span>Speak</span></button>
        <button onClick={() => setPage(Page.GUIDE_AI_CHAT)} className="gm-footer-button"><Icon name="sparkles" className="gm-footer-icon" /><span>AI Chat</span></button>
        <button onClick={() => setPage(Page.ADD_PERSON)} className="gm-footer-button"><Icon name="userPlus" className="gm-footer-icon" /><span>Add Face</span></button>
        <button onClick={() => setPage(Page.HISTORY)} className="gm-footer-button"><Icon name="clock" className="gm-footer-icon" /><span>History</span></button>
      </footer>

      {alert && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(239, 68, 68, 0.95)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          color: 'white', padding: '20px', textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '15px' }}>
            {alert.type} ALERT
          </h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '30px', maxWidth: '400px', lineHeight: '1.5' }}>{alert.message}</p>
          {alert.distance && <p style={{ fontSize: '1rem', marginBottom: '20px', fontWeight: 'bold' }}>{alert.distance} meters out of bounds.</p>}
          <button
            onClick={() => setAlert(null)}
            style={{ padding: '15px 40px', fontSize: '1.1rem', fontWeight: 'bold', color: '#ef4444', backgroundColor: 'white', border: 'none', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          >
            DISMISS
          </button>
        </div>
      )}
    </div>
  );
};
