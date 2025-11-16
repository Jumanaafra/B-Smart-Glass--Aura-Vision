import React, { useState } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './ChangePasswordScreen.css';

interface ChangePasswordScreenProps {
  setPage: (page: Page) => void;
}

export const ChangePasswordScreen: React.FC<ChangePasswordScreenProps> = ({ setPage }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
        setPage(Page.GUIDE_LOGIN);
        return;
    }
    const currentUser = JSON.parse(userStr);

    setIsLoading(true);

    try {
        const response = await fetch('https://b-smart-glass-aura-vision.onrender.com/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser._id,
                currentPassword,
                newPassword
            }),
        });

        const data = await response.json();

        if (response.ok) {
            setSuccess('Password updated successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } else {
            setError(data.message || 'Failed to update password');
        }
    } catch (err) {
        console.error("Change Password Error:", err);
        setError('Server error. Please try again.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="cp-container">
      <header className="cp-header">
        <button onClick={() => setPage(Page.SETTINGS)} className="cp-back-button">
            <Icon name="arrowLeft" className="cp-back-button-icon" />
        </button>
        <h1 className="cp-title">Change Password</h1>
      </header>
      
      <div className="cp-form">
        <div className="cp-input-fields-group">
          <div className="cp-input-group">
            <label className="cp-label">Current Password</label>
            <div className="cp-password-wrapper">
              <input type={showCurrentPassword ? 'text' : 'password'} placeholder="Enter your current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={isLoading} className="cp-input-field" />
              <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="cp-password-toggle">
                <Icon name={showCurrentPassword ? 'eyeSlash' : 'eye'} className="cp-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="cp-input-group">
            <label className="cp-label">New Password</label>
             <div className="cp-password-wrapper">
              <input type={showNewPassword ? 'text' : 'password'} placeholder="Minimum 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isLoading} className="cp-input-field" />
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="cp-password-toggle">
                <Icon name={showNewPassword ? 'eyeSlash' : 'eye'} className="cp-password-toggle-icon" />
              </button>
            </div>
          </div>
          <div className="cp-input-group">
            <label className="cp-label">Confirm New Password</label>
            <div className="cp-password-wrapper">
              <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} className="cp-input-field" />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="cp-password-toggle">
                <Icon name={showConfirmPassword ? 'eyeSlash' : 'eye'} className="cp-password-toggle-icon" />
              </button>
            </div>
          </div>
        </div>

        {error && <p className="cp-error-message">{error}</p>}
        {success && <p className="cp-success-message">{success}</p>}

        <button onClick={handleChangePassword} disabled={isLoading} className="cp-submit-button">
          {isLoading ? 'Saving...' : 'Save Password'}
        </button>
      </div>
    </div>
  );

};
