// screens/WelcomeScreen.tsx

import React from 'react';
import { Page, UserType } from '../../types';
import { Icon } from '../../components/Icon';
import './WelcomeScreen.css'; // <-- PUDHU CSS FILE-A INGA IMPORT PANNIRUKKOM

interface WelcomeScreenProps {
  setPage: (page: Page) => void;
  setUserType: (userType: UserType) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ setPage, setUserType }) => {
  const handleUserTypeSelect = (type: UserType) => {
    setUserType(type);
    if (type === UserType.VISUALLY_IMPAIRED) {
      setPage(Page.IMPAIRED_LOGIN);
    } else {
      setPage(Page.GUIDE_LOGIN);
    }
  };

  return (
    <div className="welcome-container">
      <div className="logo-container">
        <Icon name="logo" className="logo-icon" />
      </div>
      <h1 className="welcome-title">Project IRIS</h1>
      <p className="welcome-subtitle">See the world, together.</p>

      <div className="button-group">
        <button
          onClick={() => handleUserTypeSelect(UserType.VISUALLY_IMPAIRED)}
          className="action-button user-button"
        >
          {/* === ITHO, ITHULA "userCircle" ICON-A VECHITTEN === */}
          <Icon name="userCircle" className="button-icon user-icon" />
          <span className="button-text">I am a Visually Impaired User</span>
        </button>

        <button
          onClick={() => handleUserTypeSelect(UserType.GUIDE)}
          className="action-button guide-button"
        >
          {/* === ITHO, ITHULA "settings" (SLIDERS) ICON-A VECHITTEN === */}
          <Icon name="settings" className="button-icon guide-icon" />
          <span className="button-text">I am a Guide</span>
        </button>
      </div>

      <button onClick={() => setPage(Page.ACCESSIBILITY_OPTIONS)} className="accessibility-button">
        Accessibility Options
      </button>
    </div>
  );
};