// screens/HistoryScreen/HistoryScreen.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './HistoryScreen.css';

interface HistoryScreenProps {
  setPage: (page: Page) => void;
}

// DB Face type
interface FaceData {
  _id: string;
  name: string;
  imageUrl: string;
  relationship: string; // 'Known' | 'Unknown' | other
  createdAt: string;
}

// Static voice history (can be replaced by backend)
const voiceHistory = [
  { text: "What's the weather like?", time: '11:50 AM' },
  { text: "Describe what's in front of me.", time: '11:41 AM' },
  { text: "Is this crosswalk safe to cross?", time: '11:40 AM' },
  { text: "Call my guide.", time: '11:15 AM' },
];

// Last known location (placeholder / can come from backend)
const lastLocation = {
  address: 'Central Park, New York, NY',
  time: '11:52 AM',
  lat: 40.785091,
  lon: -73.968285,
};

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ setPage }) => {
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFaces = async () => {
      const userStr = localStorage.getItem('currentUser');
      if (!userStr) {
        setLoading(false);
        return;
      }
      const currentUser = JSON.parse(userStr);
      try {
        const response = await fetch(`http://localhost:5000/api/faces/${currentUser._id}`);
        if (response.ok) {
          const data = await response.json();
          setFaces(data || []);
        } else {
          console.warn('Failed to fetch faces, response not ok');
        }
      } catch (error) {
        console.error('Error fetching faces:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFaces();
  }, []);

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="hs-container">
      <header className="hs-header">
        <button onClick={() => setPage(Page.GUIDE_MAIN)} className="hs-back-button" aria-label="Back">
          <Icon name="arrowLeft" className="hs-back-button-icon" />
        </button>
        <h1 className="hs-title">Alex's Activity History</h1>
      </header>

      <main className="hs-main">
        {/* Detected People Section (from DB) */}
        <div>
          <h2 className="hs-section-title">Detected People</h2>
          <div className="hs-section-content">
            {loading ? (
              <p style={{ textAlign: 'center', color: '#888' }}>Loading faces...</p>
            ) : faces.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>
                No people added yet. Go to "Add Face" to add someone.
              </p>
            ) : (
              faces.map((person) => (
                <div key={person._id} className="hs-people-item">
                  <img
                    src={person.imageUrl || 'https://via.placeholder.com/150'}
                    alt={person.name}
                    className="hs-people-avatar"
                    style={{ objectFit: 'cover' }}
                  />
                  <div className="hs-people-info">
                    <div className="hs-people-info-header">
                      <h3 className="hs-people-name">{person.name}</h3>
                      <p className="hs-time">{formatTime(person.createdAt)}</p>
                    </div>
                    <div className="hs-people-info-footer">
                      <p className="hs-location">Saved Face</p>
                      <span
                        className={`hs-category-tag ${
                          person.relationship === 'Known' ? 'hs-category-known' : 'hs-category-unknown'
                        }`}
                      >
                        {person.relationship}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Voice Command History */}
        <div>
          <h2 className="hs-section-title">Voice Commands</h2>
          <div className="hs-section-content">
            {voiceHistory.map((command, index) => (
              <div key={index} className="hs-voice-item">
                <div className="hs-voice-info">
                  <Icon name="microphone" className="hs-voice-icon" />
                  <p className="hs-voice-text">"{command.text}"</p>
                </div>
                <p className="hs-time">{command.time}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Last Known Location */}
        <div>
          <h2 className="hs-section-title">Last Known Location</h2>
          <div className="hs-location-card">
            <div className="hs-location-header">
              <p className="hs-location-address">{lastLocation.address}</p>
              <p className="hs-time">{lastLocation.time}</p>
            </div>
            <div className="hs-location-map-container">
              <iframe
                title="Last Known Location Map"
                className="hs-map-iframe"
                src={`https://maps.google.com/maps?q=${lastLocation.lat},${lastLocation.lon}&z=15&output=embed&t=k`}
                allowFullScreen
                loading="lazy"
              ></iframe>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
