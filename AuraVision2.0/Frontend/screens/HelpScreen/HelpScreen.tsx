// screens/HelpScreen.tsx

import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './HelpScreen.css'; // <-- PUDHU CSS FILE-A INGA IMPORT PANNIRUKKOM

interface HelpScreenProps {
  setPage: (page: Page) => void;
}

// AccordionItem component-a ingaye update pannidalam
const AccordionItem: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="hs-accordion-item">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hs-accordion-button"
        aria-expanded={isOpen}
      >
        <div className="hs-accordion-label">
          <Icon name={icon} className="hs-accordion-icon" />
          <span className="hs-accordion-title">{title}</span>
        </div>
        <Icon name="arrowRight" className={`hs-arrow-icon ${isOpen ? 'hs-arrow-icon-open' : ''}`} />
      </button>
      {isOpen && (
        <div className="hs-accordion-content">
          {children}
        </div>
      )}
    </div>
  );
};

export const HelpScreen: React.FC<HelpScreenProps> = ({ setPage }) => {
  return (
    <div className="hs-container">
      <header className="hs-header">
        <button onClick={() => setPage(Page.IMPAIRED_LOGIN)} className="hs-back-button">
          <Icon name="arrowLeft" className="hs-back-button-icon" />
        </button>
        <h1 className="hs-title">Help & Support</h1>
      </header>

      <main className="hs-main">
        <AccordionItem title="About Your IRIS Glass" icon="glasses">
          <p><strong>Powering On/Off:</strong> Press and hold the power button on the right arm of the glasses for 3 seconds.</p>
          <p><strong>Charging:</strong> Use the included USB-C cable to charge your device. A full charge takes about 90 minutes.</p>
          <p><strong>Status Light:</strong> A solid white light means the device is on. A blinking blue light means it's in pairing mode.</p>
        </AccordionItem>
        
        <AccordionItem title="About the IRIS App" icon="logo">
          <p><strong>Signing In:</strong> Use the email and password you created during registration. You can also sign in with your phone number.</p>
          <p><strong>Pairing:</strong> To connect your glasses, go to the 'Pair Your IRIS Glass' screen after logging in and follow the on-screen instructions.</p>
          <p><strong>Main Screen:</strong> Tap the microphone button to ask IRIS to describe what your glasses see.</p>
        </AccordionItem>

        <AccordionItem title="Troubleshooting" icon="question">
          <p><strong>Device won't turn on:</strong> Make sure your glasses are charged. If the battery is dead, charge for at least 15 minutes before trying again.</p>
          <p><strong>Can't pair with phone:</strong> Ensure Bluetooth is enabled on your phone. Try restarting both your phone and your IRIS Glass.</p>
          <p><strong>App is not responding:</strong> Close the app completely and reopen it. Check for app updates in your app store.</p>
        </AccordionItem>

        <AccordionItem title="Contact Support" icon="speaker">
           <p>If you need more assistance, our support team is here to help.</p>
           <p><strong>Email:</strong> <a href="mailto:bharathkkbharath3@gmail.com">bharathkkbharath3@gmail.com</a>, <a href="mailto:jumanaafra301@gamil.com">jumanaafra301@gamil.com</a></p>
           <p><strong>Phone:</strong> <a href="tel:+919360294463">+91 9360294463</a>, <a href="tel:+917094978520">+91 7094978520</a></p>
        </AccordionItem>
      </main>
    </div>
  );
};