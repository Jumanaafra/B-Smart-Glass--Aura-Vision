// screens/GuideLoginScreen/GuideLoginScreen.tsx

import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './GuideLoginScreen.css';

interface GuideLoginScreenProps {
  setPage: (page: Page) => void;
}

export const GuideLoginScreen: React.FC<GuideLoginScreenProps> = ({ setPage }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      // Backend login API
      const response = await fetch('https://b-smart-glass-aura-vision.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Save minimal session info (backend should return token/user)
        if (data.token) localStorage.setItem('guideAuthToken', data.token);
        else localStorage.setItem('guideAuthToken', 'logged-in');

        if (data.user) localStorage.setItem('currentUser', JSON.stringify(data.user));

        setPage(Page.GUIDE_MAIN);
      } else {
        setError(data.message || 'Invalid email or password.');
      }
    } catch (err) {
      console.error('Login Error:', err);
      setError('Server connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="gl-container">
      <h1 className="gl-title">Project IRIS</h1>
      <h2 className="gl-subtitle">Guide Login</h2>

      <div className="gl-form" role="form" aria-labelledby="guide-login">
        <div className="gl-input-group">
          <label className="gl-label">Email Address</label>
          <div className="gl-input-wrapper">
            <span className="gl-input-icon" aria-hidden>
              <Icon name="userCircle" className="w-5 h-5" />
            </span>
            <input
              type="email"
              placeholder="Enter your email"
              className="gl-input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              aria-label="Email address"
            />
          </div>
        </div>

        <div className="gl-input-group">
          <label className="gl-label">Password</label>
          <div className="gl-input-wrapper">
            <span className="gl-input-icon" aria-hidden>
              <Icon name="lock" className="w-5 h-5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              className="gl-input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              aria-label="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="gl-password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon name={showPassword ? 'eyeSlash' : 'eye'} className="gl-password-toggle-icon" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPage(Page.FORGOT_PASSWORD)}
            className="gl-forgot-link"
            aria-label="Forgot password"
            disabled={isLoading}
          >
            Forgot Password?
          </button>
        </div>

        {error && (
          <p className="gl-error-message" role="alert">
            {error}
          </p>
        )}

        <button onClick={handleLogin} disabled={isLoading} className="gl-login-button" aria-busy={isLoading}>
          {isLoading ? 'Logging in...' : 'Log In'}
        </button>
      </div>

      <p className="gl-signup-text">
        Don't have an account?{' '}
        <button onClick={() => setPage(Page.GUIDE_REGISTER)} className="gl-signup-link">
          Sign Up
        </button>
      </p>
    </div>
  );
};

