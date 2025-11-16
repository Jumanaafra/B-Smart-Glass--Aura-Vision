// screens/RegistrationScreen.tsx

import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './RegistrationScreen.css';

interface RegistrationScreenProps {
  setPage: (page: Page) => void;
}

export const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ setPage }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceId, setDeviceId] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleCreateAccount = async () => {
    setError(null);
    if (!fullName || !email || !password || !confirmPassword || !deviceId) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    setIsLoading(true);

    try {
      // --- INDHA LINE THAAN BACKEND-AI CALL PANNUDHU ---
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          deviceId,
          userType: 'VISUALLY_IMPAIRED' // Ithu mukkiyam
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Registration successful! You can now log in.');
        setPage(Page.IMPAIRED_LOGIN);
      } else {
        setError(data.message || 'Registration failed.');
      }
    } catch (err) {
      console.error("Registration Error:", err);
      setError('Server connection failed. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="reg-container">
      <header className="reg-header">
        <button onClick={() => setPage(Page.IMPAIRED_LOGIN)} className="reg-back-button">
            <Icon name="arrowLeft" className="reg-back-button-icon" />
        </button>
        <h1 className="reg-title">Create Account</h1>
      </header>
      
      <p className="reg-subtitle">
        Enter your details to start your journey with IRIS.
      </p>

      <div className="reg-form">
        <div className="reg-input-fields-group">
          <div className="reg-input-group">
            <label className="reg-label">Full Name</label>
            <input type="text" placeholder="Alex Ray" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isLoading} className="reg-input-field" />
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} className="reg-input-field" />
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Password</label>
            <div className="reg-password-wrapper">
              <input type={showPassword ? 'text' : 'password'} placeholder="Minimum 8 characters" className="reg-input-field" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading}/>
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="reg-password-toggle">
                <Icon name={showPassword ? 'eyeSlash' : 'eye'} className="reg-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Confirm Password</label>
            <div className="reg-password-wrapper">
              <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Re-enter your password" className="reg-input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading}/>
               <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="reg-password-toggle">
                <Icon name={showConfirmPassword ? 'eyeSlash' : 'eye'} className="reg-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Device ID</label>
            <input type="text" placeholder="Enter your IRIS Glass Device ID" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="reg-input-field" disabled={isLoading} />
          </div>
        </div>

        {error && <p className="reg-error-message">{error}</p>}

        <button onClick={handleCreateAccount} disabled={isLoading} className="reg-submit-button">
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </button>

        <div className="reg-login-text">
          <p>Already have an account? <button onClick={() => setPage(Page.IMPAIRED_LOGIN)} className="reg-login-link">Log In</button></p>
        </div>
      </div>
    </div>
  );
};