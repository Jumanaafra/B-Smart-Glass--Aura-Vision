// screens/LegalTextScreen/LegalTextScreen.tsx

import React from 'react';
import { Page, LegalTextProps } from '../../types';
import { Icon } from '../../components/Icon';
import './LegalTextScreen.css'; // <-- Intha CSS file-a adutha step-la create pannuvom

interface LegalTextScreenProps {
  setPage: (page: Page) => void;
  pageProps: LegalTextProps; // Namma content-a inga vaangurom
}

export const LegalTextScreen: React.FC<LegalTextScreenProps> = ({ setPage, pageProps }) => {
  const { title, content, returnPage } = pageProps;

  return (
    <div className="ls-container">
      <header className="ls-header">
        <button onClick={() => setPage(returnPage)} className="ls-back-button">
          <Icon name="arrowLeft" className="ls-back-button-icon" />
        </button>
        <h1 className="ls-title">{title}</h1>
      </header>

      <main className="ls-main">
        {/*
          Ithukulla irukkura text-a \n vechu pirichi, 
          paragraph-a kaatrom.
        */}
        {content.split('\n').map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </main>
    </div>
  );
};