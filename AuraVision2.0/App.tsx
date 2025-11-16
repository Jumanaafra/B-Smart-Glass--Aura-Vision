// App.tsx

import React, { useState } from 'react';
import { Page, UserType, LegalTextProps } from './types';
import { WelcomeScreen } from './screens/WelcomeScreen/WelcomeScreen';
import { LoginScreen } from './screens/LoginScreen/LoginScreen';
import { GuideLoginScreen } from './screens/GuideLoginScreen/GuideLoginScreen';
import { PairingScreen } from './screens/PairingScreen/PairingScreen';
import { VisuallyImpairedMain } from './screens/VisuallyImpairedMain/VisuallyImpairedMain';
import { EmergencyAlert } from './screens/EmergencyAlert/EmergencyAlert';
import { GuideMain } from './screens/GuideMain/GuideMain';
import { AddPersonScreen } from './screens/AddPersonScreen/AddPersonScreen';
import { SettingsScreen } from './screens/SettingsScreen/SettingsScreen';
import { RegistrationScreen } from './screens/RegistrationScreen/RegistrationScreen';
import { HelpScreen } from './screens/HelpScreen/HelpScreen';
import { GuideRegistrationScreen } from './screens/RegistrationScreen/GuideRegistrationScreen';
import { GuideAiChatScreen } from './screens/GuideAiChatScreen/GuideAiChatScreen';
import { HistoryScreen } from './screens/HistoryScreen/HistoryScreen';
import { AccessibilityScreen } from './screens/AccessibilityScreen/AccessibilityScreen';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen/ChangePasswordScreen';
import { LegalTextScreen } from './screens/LegalTextScreen/LegalTextScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen/ForgotPasswordScreen';

const App: React.FC = () => {
  const [page, setPage] = useState<Page>(Page.WELCOME);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [pageProps, setPageProps] = useState<any>(null);

  const navigateTo = (page: Page, props: any = null) => {
    setPageProps(props);
    setPage(page);
  };

  const renderPage = () => {
    switch (page) {
      case Page.WELCOME:
        return <WelcomeScreen setPage={navigateTo} setUserType={setUserType} />;
      case Page.IMPAIRED_LOGIN:
        return <LoginScreen setPage={navigateTo} />;
      case Page.ACCESSIBILITY_OPTIONS:
        return <AccessibilityScreen setPage={navigateTo} />;
      case Page.GUIDE_LOGIN:
        return <GuideLoginScreen setPage={navigateTo} />;
      case Page.PAIRING:
        return <PairingScreen setPage={navigateTo} />;
      case Page.IMPAIRED_MAIN:
        return <VisuallyImpairedMain setPage={navigateTo} />;
      case Page.GUIDE_MAIN:
        return <GuideMain setPage={navigateTo} />;
      case Page.EMERGENCY_ALERT:
        return <EmergencyAlert setPage={navigateTo} />;
      case Page.ADD_PERSON:
        return <AddPersonScreen setPage={navigateTo} />;
      case Page.SETTINGS:
        return <SettingsScreen setPage={navigateTo} />; 
      case Page.REGISTER:
        return <RegistrationScreen setPage={navigateTo} />;
      case Page.GUIDE_REGISTER:
        return <GuideRegistrationScreen setPage={navigateTo} />;
      case Page.HELP:
        return <HelpScreen setPage={navigateTo} />;
      case Page.GUIDE_AI_CHAT:
        return <GuideAiChatScreen setPage={navigateTo} />;
      case Page.HISTORY:
        return <HistoryScreen setPage={navigateTo} />;
      case Page.CHANGE_PASSWORD:
        return <ChangePasswordScreen setPage={navigateTo} />;
      case Page.LEGAL_TEXT:
        return <LegalTextScreen setPage={navigateTo} pageProps={pageProps as LegalTextProps} />;
      case Page.FORGOT_PASSWORD:
        return <ForgotPasswordScreen setPage={navigateTo} />;
      default:
        return <WelcomeScreen setPage={navigateTo} setUserType={setUserType} />;
    }
  };

  return <div className="font-sans max-w-2xl mx-auto bg-iris-bg min-h-screen shadow-2xl shadow-iris-primary-blue/10">{renderPage()}</div>;
};

export default App;