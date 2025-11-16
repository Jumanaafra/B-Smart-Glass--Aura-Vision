// screens/SettingsScreen/tsx

import React, { useState, useEffect } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { Toggle } from '../../components/Toggle';
import './SettingsScreen.css';

interface SettingsScreenProps {
  setPage: (page: Page, props?: any) => void;
}

const SettingsItem: React.FC<{ 
  icon: string, 
  label: string, 
  children: React.ReactNode, 
  isNav?: boolean,
  onClick?: () => void 
}> = ({ icon, label, children, isNav, onClick }) => {
  
  const content = (
    <>
      <div className="ss-setting-item-label">
        <div className="ss-setting-item-icon-wrapper">
          <Icon name={icon} className="ss-setting-item-icon"/>
        </div>
        <span className="ss-setting-item-text">{label}</span>
      </div>
      <div className="ss-setting-item-action">
        {children}
        {isNav && (
          <div className="ss-setting-item-nav-icon-wrapper">
            <Icon name="arrowRight" className="ss-setting-item-nav-icon"/>
          </div>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="ss-setting-item ss-setting-button">
        {content}
      </button>
    );
  }

  return (
    <div className="ss-setting-item">
      {content}
    </div>
  );
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ setPage }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        darkMode: true,
        hapticFeedback: true,
        narrationSpeed: 50,
        lowBatteryAlerts: true,
        connectionStatus: false,
        guideMessages: true,
    });

    useEffect(() => {
        const loadUserData = async () => {
            const userStr = localStorage.getItem('currentUser');
            if (!userStr) {
                setPage(Page.IMPAIRED_LOGIN); 
                return;
            }
            
            const currentUser = JSON.parse(userStr);
            
            try {
                const response = await fetch(`https://b-smart-glass-aura-vision.onrender.com/api/user/${currentUser._id}`);
                if (response.ok) {
                    const userData = await response.json();
                    setUser(userData);
                    if (userData.settings) {
                        setSettings(userData.settings);
                    }
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };

        loadUserData();
    }, [setPage]);

    const updateSetting = async (key: string, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        if (!user) return;

        try {
            await fetch(`http://localhost:5000/api/user/${user._id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: newSettings }),
            });
        } catch (error) {
            console.error("Error saving settings:", error);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('userAuthToken');
        localStorage.removeItem('currentUser');
        setPage(Page.WELCOME);
    };

    const openLegalPage = (type: 'help' | 'terms' | 'privacy') => {
        // (Legal text content removed for brevity, add if needed)
        setPage(Page.LEGAL_TEXT, { content: type === 'terms' ? 'TERMS' : type === 'privacy' ? 'PRIVACY' : 'HELP' });
    };

    if (loading) {
        return <div className="ss-container" style={{justifyContent:'center', alignItems:'center'}}>Loading...</div>;
    }

  return (
    <div className="ss-container">
      <header className="ss-header">
        <button onClick={() => setPage(Page.IMPAIRED_MAIN)} className="ss-back-button">
            <Icon name="arrowLeft" className="ss-back-button-icon" />
        </button>
        <h1 className="ss-title">Settings & Profile</h1>
      </header>

      <main className="ss-main">
        <div className="ss-profile-section">
            <Icon name="userCircle" className="ss-profile-avatar"/>
            <div className="ss-profile-info">
                <h2>{user?.fullName || "Guest User"}</h2>
                <p>{user?.email || "No email"}</p>
            </div>
            <button className="ss-profile-edit-button">Edit</button>
        </div>
        
        <SettingsItem icon="lock" label="Change Password" isNav onClick={() => setPage(Page.CHANGE_PASSWORD)}>
          <div></div>
        </SettingsItem>

        <div>
            <h3 className="ss-section-heading">Device Management</h3>
            <div className="ss-setting-item">
                <div className="ss-setting-item-label">
                    <div className="ss-setting-item-icon-wrapper">
                      <Icon name="glasses" className="ss-setting-item-icon"/>
                    </div>
                    <span className="ss-setting-item-text">
                      IRIS Glass Connected
                    </span>
                </div>
                <button className="ss-unpair-button">Unpair</button>
            </div>
        </div>

        <div>
            <h3 className="ss-section-heading">Preferences</h3>
            <div className="ss-section-items-group">
                <SettingsItem icon="moon" label="Dark Mode">
                    <Toggle checked={settings.darkMode} onChange={(val) => updateSetting('darkMode', val)} />
                </SettingsItem>
                <SettingsItem icon="haptic" label="Haptic Feedback">
                    <Toggle checked={settings.hapticFeedback} onChange={(val) => updateSetting('hapticFeedback', val)} />
                </SettingsItem>
                
                <div className="ss-slider-container">
                    <div className="ss-slider-header">
                        <div className="ss-setting-item-label">
                            <div className="ss-setting-item-icon-wrapper">
                              <Icon name="speaker" className="ss-setting-item-icon"/>
                            </div>
                            <span className="ss-setting-item-text">Voice Narration Speed</span>
                        </div>
                        <span className="ss-slider-value">{settings.narrationSpeed}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="100" value={settings.narrationSpeed}
                        onChange={(e) => updateSetting('narrationSpeed', Number(e.target.value))}
                        className="ss-slider"
                    />
                </div>
            </div>
        </div>

        <div>
            <h3 className="ss-section-heading">Notifications</h3>
            <div className="ss-section-items-group">
                <SettingsItem icon="bell" label="Low Battery Alerts">
                    <Toggle checked={settings.lowBatteryAlerts} onChange={(val) => updateSetting('lowBatteryAlerts', val)} />
                </SettingsItem>
                <SettingsItem icon="bell" label="Connection Status">
                    <Toggle checked={settings.connectionStatus} onChange={(val) => updateSetting('connectionStatus', val)} />
                </SettingsItem>
                <SettingsItem icon="bell" label="Guide Messages">
                    <Toggle checked={settings.guideMessages} onChange={(val) => updateSetting('guideMessages', val)} />
                </SettingsItem>
            </div>
        </div>

        <div>
            <h3 className="ss-section-heading">Support & Legal</h3>
            <div className="ss-section-items-group">
                <SettingsItem icon="question" label="Help Center" isNav onClick={() => openLegalPage('help')}><div></div></SettingsItem>
                <SettingsItem icon="document" label="Terms of Service" isNav onClick={() => openLegalPage('terms')}><div></div></SettingsItem>
                <SettingsItem icon="shield" label="Privacy Policy" isNav onClick={() => openLegalPage('privacy')}><div></div></SettingsItem>
            </div>
        </div>
        
        <div className="ss-logout-button-container">
             <button onClick={handleLogout} className="ss-logout-button">Logout</button>
        </div>
      </main>
    </div>
  );

};
