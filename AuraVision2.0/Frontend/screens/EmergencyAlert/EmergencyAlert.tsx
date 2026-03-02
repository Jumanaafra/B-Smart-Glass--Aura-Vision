// screens/EmergencyAlert.tsx

import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import './EmergencyAlert.css'; // <-- PUDHU CSS FILE-A INGA IMPORT PANNIRUKKOM

interface EmergencyAlertProps {
  setPage: (page: Page) => void;
}

export const EmergencyAlert: React.FC<EmergencyAlertProps> = ({ setPage }) => {
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    // Simulate connection time
    const timer = setTimeout(() => setConnecting(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="ea-container">
      <h1 className="ea-title">EMERGENCY ALERT</h1>
      
      <div className="ea-content">
        <img src="https://picsum.photos/seed/johndoe/80/80" alt="John Doe" className="ea-avatar" />
        <h2 className="ea-subtitle">John Doe has triggered an alert</h2>
        <p className="ea-address">📍 123 Main St, Anytown</p>
        
        <div className="ea-camera-box">
          {connecting ? (
            <>
              <div className="ea-spinner"></div>
              <p className="ea-connecting-text">Connecting to John's camera...</p>
            </>
          ) : (
             <video className="ea-video" autoPlay loop muted>
                <source src="https://storage.googleapis.com/static.aiforge.studio/stock/pexels-kelly-2943184-1280x720-30fps.mp4" type="video/mp4" />
                Your browser does not support the video tag.
             </video>
          )}
        </div>
      </div>
      
      <div className="ea-footer">
        <button className="ea-call-button">
          📞 Call John
        </button>
        <button onClick={() => setPage(Page.WELCOME)} className="ea-dismiss-button">
          Dismiss
        </button>
      </div>
    </div>
  );
};