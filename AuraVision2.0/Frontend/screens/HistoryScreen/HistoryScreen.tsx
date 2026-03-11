// screens/HistoryScreen/HistoryScreen.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { historyAPI, userAPI } from '../../utils/api';
import './HistoryScreen.css';

// Leaflet Icon Fix — use string URLs to avoid TypeScript PNG import errors
import L from 'leaflet';
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
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
  const [filterType, setFilterType] = useState<'ALL' | 'VOICE' | 'LOCATION'>('ALL');
  const [lastKnownAddress, setLastKnownAddress] = useState("Fetching location...");
  const [lastLoc, setLastLoc] = useState<{ lat: number, lng: number } | null>(null);

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      return data.display_name || "Unknown Location";
    } catch (e) {
      return "Address unavailable";
    }
  };

  const loadHistory = async (pageNum: number, currentFilter: 'ALL' | 'VOICE' | 'LOCATION') => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    const currentUser = JSON.parse(userStr);

    setLoading(true);
    try {
      let targetUserId = currentUser._id;
      let targetLocation: { lat: number, lng: number } | null = null;

      if (currentUser.userType === 'GUIDE') {
        // Use cached connectedVIId from localStorage (set during GuideMain load)
        const cachedVIId = localStorage.getItem('connectedVIId');
        if (cachedVIId) {
          targetUserId = cachedVIId;
          // Refresh the VI user's profile to get latest lastLocation
          const profileRes = await userAPI.getProfile(cachedVIId);
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            targetLocation = profileData.lastLocation || null;
          }
        } else {
          // Fallback: fetch from API
          const viRes = await userAPI.getConnectedVI();
          if (!viRes.ok) {
            setLastKnownAddress('Cannot find connected VI user.');
            setLoading(false);
            return;
          }
          const viData = await viRes.json();
          targetUserId = viData._id;
          targetLocation = viData.lastLocation || null;
          localStorage.setItem('connectedVIId', viData._id);
        }
      } else {
        // VI user: Refresh own profile to get latest location
        const profileRes = await userAPI.getProfile(currentUser._id);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          targetLocation = profileData.lastLocation || null;
        } else {
          targetLocation = currentUser.lastLocation || null;
        }
      }

      // 2. Get History List
      const res = await historyAPI.getHistory(targetUserId, pageNum, 30);
      const data = await res.json();

      let displayData = Array.isArray(data) ? data : [];
      if (currentFilter !== 'ALL') {
        displayData = displayData.filter((item: any) => item.type === currentFilter);
      }

      // Limit to 10
      displayData = displayData.slice(0, 10);

      if (Array.isArray(data) && data.length < 30) setHasMore(false);

      const enrichedData = await Promise.all(displayData.map(async (item: any) => {
        let addr = '';
        if (item.location && item.location.lat) {
          addr = `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`;
        }
        return { ...item, address: addr };
      }));

      if (pageNum === 1) {
        setHistory(enrichedData);
      } else {
        setHistory(prev => {
          const newItems = enrichedData.filter((n: any) => !prev.some(p => p._id === n._id));
          return [...prev, ...newItems];
        });
      }

      // 3. Get Last Known Location (only on first page)
      if (pageNum === 1) {
        if (targetLocation && targetLocation.lat) {
          setLastLoc(targetLocation);
          // Show coords immediately while Nominatim loads
          setLastKnownAddress(`${targetLocation.lat.toFixed(4)}, ${targetLocation.lng.toFixed(4)}`);
          // Then try to get a human-readable address
          fetchAddress(targetLocation.lat, targetLocation.lng).then(addr => {
            setLastKnownAddress(addr);
          });
        } else {
          setLastKnownAddress('No location history yet.');
        }
      }

    } catch (err) {
      console.error(err);
      setLastKnownAddress('Error loading location.');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    setPageNumber(1);
    setHasMore(true);
    // On mount or filter change, reload page 1 with new filter
    loadHistory(1, filterType);
  }, [filterType]);

  const handleLoadMore = () => {
    const nextPage = pageNumber + 1;
    setPageNumber(nextPage);
    loadHistory(nextPage, filterType);
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
            <h2 className="hs-section-title" style={{ marginBottom: 0 }}>LAST SEEN LOCATION</h2>
          </div>
          <p className="hs-location-address">{lastKnownAddress}</p>

          <div className="hs-location-map-container">
            {lastLoc ? (
              <MapContainer center={[lastLoc.lat, lastLoc.lng]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[lastLoc.lat, lastLoc.lng]} />
              </MapContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading Map...</div>
            )}
          </div>
        </div>

        {/* History List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="hs-section-title" style={{ marginBottom: 0 }}>ACTIVITY LOG</h2>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'ALL' | 'VOICE' | 'LOCATION')}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', backgroundColor: '#fff' }}
            >
              <option value="ALL">All Activity</option>
              <option value="VOICE">Voice Commands</option>
              <option value="LOCATION">Location Updates</option>
            </select>
          </div>
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
              <p style={{ textAlign: 'center', color: '#666' }}>No history found.</p>
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
