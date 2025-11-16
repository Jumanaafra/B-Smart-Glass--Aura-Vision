// screens/GuideRegistrationScreen.tsx

import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './RegistrationScreen.css';

interface GuideRegistrationScreenProps {
  setPage: (page: Page) => void;
}

export const GuideRegistrationScreen: React.FC<GuideRegistrationScreenProps> = ({ setPage }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceId, setDeviceId] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (!fullName || !email || !password || !confirmPassword || !deviceId) {
        setError('Please fill in all fields.');
        return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // --- API CALL ---
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          deviceId,
          userType: 'GUIDE' // Ithu mukkiyam
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Registration successful! Please log in.');
        setPage(Page.GUIDE_LOGIN);
      } else {
        setError(data.message || 'Registration failed.');
      }
    } catch (err) {
      console.error("Registration Error:", err);
      setError('Server connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="reg-container">
      <header className="reg-header">
        <button onClick={() => setPage(Page.GUIDE_LOGIN)} className="reg-back-button">
            <Icon name="arrowLeft" className="reg-back-button-icon" />
        </button>
        <h1 className="reg-title">Guide Registration</h1>
      </header>
      
      <p className="reg-subtitle">
        Create an account to assist a visually impaired user.
      </p>

      <div className="reg-form">
        <div className="reg-input-fields-group">
          <div className="reg-input-group">
            <label className="reg-label">Full Name</label>
            <input type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} className="reg-input-field" />
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="reg-input-field" />
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Password</label>
            <div className="reg-password-wrapper">
              <input type={showPassword ? 'text' : 'password'} placeholder="Minimum 8 characters" className="reg-input-field" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="reg-password-toggle">
                <Icon name={showPassword ? 'eyeSlash' : 'eye'} className="reg-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Confirm Password</label>
            <div className="reg-password-wrapper">
              <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Re-enter your password" className="reg-input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
               <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="reg-password-toggle">
                <Icon name={showConfirmPassword ? 'eyeSlash' : 'eye'} className="reg-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="reg-input-group">
            <label className="reg-label">Blind Person's Device ID</label>
            <input type="text" placeholder="Enter the user's IRIS Glass ID" value={deviceId} onChange={e => setDeviceId(e.target.value)} className="reg-input-field" />
          </div>
        </div>

        {error && <p className="reg-error-message">{error}</p>}

        <button onClick={handleRegister} disabled={isLoading} className="reg-submit-button">
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </button>

        <div className="reg-login-text">
          <p>Already have an account? <button onClick={() => setPage(Page.GUIDE_LOGIN)} className="reg-login-link">Log In</button></p>
        </div>
      </div>
    </div>
  );
};