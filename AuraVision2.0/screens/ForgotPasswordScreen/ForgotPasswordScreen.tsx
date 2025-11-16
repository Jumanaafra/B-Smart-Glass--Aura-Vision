// screens/ForgotPasswordScreen/ForgotPasswordScreen.tsx

import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './ForgotPasswordScreen.css';

interface ForgotPasswordScreenProps {
  setPage: (page: Page) => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ setPage }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendLink = async () => {
    setError(null);
    setSuccess(null);

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      // --- API CALL (Forgot Password) ---
      const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        // Expecting { message: '...' } from server
        setSuccess(data.message || `If an account exists for ${email}, a reset link has been sent.`);
        setEmail('');
      } else {
        setError(data.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Forgot Password Error:', err);
      setError('Server error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fp-container">
      <header className="fp-header">
        <button onClick={() => setPage(Page.GUIDE_LOGIN)} className="fp-back-button" aria-label="Back to login">
          <Icon name="arrowLeft" className="fp-back-button-icon" />
        </button>
        <h1 className="fp-title">Forgot Password</h1>
      </header>

      <p className="fp-subtitle">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      <div className="fp-form">
        <div className="fp-input-group">
          <label className="fp-label">Email Address</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            className="fp-input-field"
            aria-label="Email address"
          />
        </div>

        {error && <p className="fp-error-message" role="alert">{error}</p>}
        {success && <p className="fp-success-message" role="status">{success}</p>}

        <button
          onClick={handleSendLink}
          disabled={isLoading}
          className="fp-submit-button"
          aria-busy={isLoading}
        >
          {isLoading ? 'Sending Link...' : 'Send Reset Link'}
        </button>
      </div>
    </div>
  );
};
