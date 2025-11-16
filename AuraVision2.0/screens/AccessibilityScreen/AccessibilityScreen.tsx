// screens/AccessibilityScreen/AccessibilityScreen.tsx

import React, { useState, useEffect } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { Toggle } from '../../components/Toggle';
import './AccessibilityScreen.css';

interface AccessibilityScreenProps {
  setPage: (page: Page) => void;
}

export const AccessibilityScreen: React.FC<AccessibilityScreenProps> = ({ setPage }) => {
  const [voiceNarration, setVoiceNarration] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Load Settings
  useEffect(() => {
    const loadSettings = async () => {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            const currentUser = JSON.parse(userStr);
            try {
                const response = await fetch(`http://localhost:5000/api/user/${currentUser._id}`);
                if (response.ok) {
                    const userData = await response.json();
                    setUser(userData);
                    if (userData.settings) {
                        setVoiceNarration(userData.settings.voiceNarration);
                        setHighContrast(userData.settings.highContrast);
                    }
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            }
        }
    };
    loadSettings();
  }, []);

  // Save Settings
  const handleDone = async () => {
    if (user) {
        try {
            const updatedSettings = { 
                ...user.settings, 
                voiceNarration, 
                highContrast 
            };

            await fetch(`http://localhost:5000/api/user/${user._id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: updatedSettings }),
            });
        } catch (error) {
            console.error("Error saving accessibility settings:", error);
        }
    }
    setPage(Page.WELCOME);
  };

  return (
    <div className="as-container">
      <header className="as-header">
        <button onClick={() => setPage(Page.WELCOME)} className="as-back-button">
          <Icon name="arrowLeft" className="as-back-button-icon" />
        </button>
        <h1 className="as-title">Accessibility Options</h1>
      </header>
      <main className="as-main">
        <div className="accessibility-box">
          <div className="toggle-item">
            <div className="toggle-label">
              <span className="toggle-icon">🔊</span>
              <span>Voice Narration</span>
            </div>
            <Toggle checked={voiceNarration} onChange={setVoiceNarration} />
          </div>
          <div className="toggle-item">
            <div className="toggle-label">
              <span className="toggle-icon">◑</span>
              <span>High-Contrast Mode</span>
            </div>
            <Toggle checked={highContrast} onChange={setHighContrast} />
          </div>
        </div>
        <p className="as-info-text">You can change these settings at any time from the login screen or in-app settings.</p>
        <button onClick={handleDone} className="as-done-button">Done</button>
      </main>
    </div>
  );
};