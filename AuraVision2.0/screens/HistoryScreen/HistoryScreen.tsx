// screens/HistoryScreen/HistoryScreen.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './HistoryScreen.css';

// Leaflet Icon Fix
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

interface HistoryScreenProps {
  setPage: (page: Page) => void;
}

interface HistoryItem {
  _id: string;
  type: 'VOICE' | 'LOCATION';
  content: string;
  timestamp: string;
  location?: { lat: number; lng: number };
  address?: string; // நாமளே கண்டுபிடிச்சு சேர்ப்போம்
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ setPage }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lastKnownAddress, setLastKnownAddress] = useState("Fetching location...");
  const [lastLoc, setLastLoc] = useState<{lat: number, lng: number} | null>(null);

  const fetchAddress = async (lat: number, lng: number) => {
      try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          return data.display_name || "Unknown Location";
      } catch (e) {
          return "Address unavailable";
      }
  };

  const loadHistory = async (pageNum: number) => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    const currentUser = JSON.parse(userStr);

    setLoading(true);
    try {
        // 1. Get History List
        const res = await fetch(`https://b-smart-glass-aura-vision.onrender.com/api/history/${currentUser._id}?page=${pageNum}&limit=15`);
        const data = await res.json();

        if (data.length < 15) setHasMore(false);

        // 2. Get Addresses for each history item (in parallel)
        const enrichedData = await Promise.all(data.map(async (item: any) => {
            let addr = "";
            if (item.location && item.location.lat) {
                // ரொம்ப பழைய ரெக்கார்டா இருந்தா அட்ரஸ் தேட வேண்டாம், ஸ்லோ ஆகிடும்
                 // இப்போதைக்கு சும்மா Lat/Lng காட்டுவோம், யூசர் கிளிக் பண்ணா மேப்ல பார்க்கலாம்
                 addr = `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`;
            }
            return { ...item, address: addr };
        }));

        setHistory(prev => [...prev, ...enrichedData]);

        // 3. Get Last Known Location (Only on first load)
        if (pageNum === 1) {
            const locRes = await fetch(`https://b-smart-glass-aura-vision.onrender.com/api/user/${currentUser._id}`);
            const userData = await locRes.json();
            if (userData.lastLocation) {
                setLastLoc(userData.lastLocation);
                const addr = await fetchAddress(userData.lastLocation.lat, userData.lastLocation.lng);
                setLastKnownAddress(addr);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      loadHistory(1);
  }, []);

  const handleLoadMore = () => {
      const nextPage = pageNumber + 1;
      setPageNumber(nextPage);
      loadHistory(nextPage);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="hs-container">
      <header className="hs-header">
        <button onClick={() => setPage(Page.GUIDE_MAIN)} className="hs-back-button">
          <Icon name="arrowLeft" className="hs-back-button-icon" />
        </button>
        <h1 className="hs-title">User History</h1>
      </header>

      <main className="hs-main">
        
        {/* Last Location Card */}
        <div className="hs-location-card">
            <div className="hs-location-header">
              <h2 className="hs-section-title" style={{marginBottom:0}}>LAST SEEN LOCATION</h2>
            </div>
            <p className="hs-location-address">{lastKnownAddress}</p>
            
            <div className="hs-location-map-container">
                {lastLoc ? (
                    <MapContainer center={[lastLoc.lat, lastLoc.lng]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[lastLoc.lat, lastLoc.lng]} />
                    </MapContainer>
                ) : (
                    <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%'}}>Loading Map...</div>
                )}
            </div>
        </div>

        {/* History List */}
        <div>
          <h2 className="hs-section-title">ACTIVITY LOG</h2>
          <div className="hs-section-content">
            {history.map((item) => (
              <div key={item._id} className="hs-voice-item">
                <div className="hs-voice-info">
                  <div className="hs-icon-box">
                      <Icon name={item.type === 'VOICE' ? 'microphone' : 'glasses'} className="hs-voice-icon" />
                  </div>
                  <div>
                      <p className="hs-voice-text">"{item.content}"</p>
                      {item.location && item.location.lat !== 0 && (
                          <p className="hs-mini-loc">📍 {item.address || "Unknown Place"}</p>
                      )}
                  </div>
                </div>
                <p className="hs-time">{formatTime(item.timestamp)}</p>
              </div>
            ))}

            {history.length === 0 && !loading && (
                <p style={{textAlign:'center', color:'#666'}}>No history found.</p>
            )}
          </div>

          {hasMore && (
              <button onClick={handleLoadMore} className="hs-load-more" disabled={loading}>
                  {loading ? "Loading..." : "Load More"}
              </button>
          )}
        </div>

      </main>
    </div>
  );
};
