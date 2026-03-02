// screens/AddPersonScreen/AddPersonScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { facesAPI } from '../../utils/api';
import './AddPersonScreen.css';

interface AddPersonScreenProps {
  setPage: (page: Page) => void;
}

export const AddPersonScreen: React.FC<AddPersonScreenProps> = ({ setPage }) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [name, setName] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedFaces, setSavedFaces] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSavedFaces();
  }, []);

  const fetchSavedFaces = async () => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    const currentUser = JSON.parse(userStr);

    try {
      // Use the centralized apiFetch wrapper (facesAPI) so it automatically
      // handles the Vercel/production base URL and the Bearer token headers.
      const res = await facesAPI.getFaces(currentUser._id);
      const data = await res.json();
      if (res.ok) {
        setSavedFaces(data);
      }
    } catch (e) {
      console.error("Failed to load saved faces", e);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!name) return;

    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      alert("Please login first!");
      setPage(Page.GUIDE_LOGIN);
      return;
    }
    const currentUser = JSON.parse(userStr);

    setIsLoading(true);

    try {
      const response = await facesAPI.addPerson(
        currentUser._id,
        name,
        imagePreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      );

      const data = await response.json();

      if (response.ok) {
        setShowSuccess(true);
        setName('');
        setImagePreview(null);
        await fetchSavedFaces(); // Refresh the gallery list
        setTimeout(() => {
          setShowSuccess(false);
        }, 3000);
      } else {
        alert(data.message || "Failed to add person");
      }

    } catch (error) {
      console.error("Error adding person:", error);
      alert("Server error. Check if backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const isLimitReached = savedFaces.length >= 5;

  return (
    <div className="ap-container">
      <header className="ap-header">
        <button onClick={() => setPage(Page.GUIDE_MAIN)} className="ap-back-button">
          <Icon name="arrowLeft" className="ap-back-button-icon" />
        </button>
        <h1 className="ap-title">Manage Faces</h1>
      </header>

      <div className="ap-body">

        {isLimitReached ? (
          <div className="ap-limit-banner">
            Testing Phase: Limit reached. You can only save up to 5 faces.
          </div>
        ) : (
          <>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileChange}
            />

            <div className="ap-upload-box" onClick={handleUploadClick}>
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="ap-image-preview" />
              ) : (
                <>
                  <span className="ap-upload-icon">📸</span>
                  <p className="ap-upload-title">Tap to Upload Photo</p>
                  <p className="ap-upload-subtitle">Choose a clear photo of the person's face.</p>
                  <button className="ap-upload-button">Upload Photo</button>
                </>
              )}
            </div>

            <div className="ap-input-group">
              <label className="ap-label">Name</label>
              <input
                type="text"
                placeholder="Enter the individual's name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ap-input-field"
                disabled={isLoading}
              />
            </div>

            <div className="ap-footer">
              <button
                onClick={handleSave}
                className="ap-save-button"
                disabled={!name || !imagePreview || isLoading}
              >
                {isLoading ? 'Saving...' : 'Add Face'}
              </button>
              {showSuccess && (
                <div className="ap-success-message">
                  Person added successfully!
                </div>
              )}
            </div>
          </>
        )}

        {/* --- Face Gallery --- */}
        <div className="ap-gallery-header">
          <h2 className="ap-gallery-title">Saved Faces</h2>
          <span className="ap-gallery-count">{savedFaces.length}/5</span>
        </div>

        <div className="ap-gallery-list">
          {savedFaces.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#8E8E93', fontSize: '0.875rem' }}>No faces added yet.</p>
          ) : (
            savedFaces.map((face) => (
              <div key={face._id} className="ap-gallery-item">
                <img
                  src={face.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${face.name}`}
                  alt={face.name}
                  className="ap-gallery-image"
                />
                <span className="ap-gallery-name">{face.name}</span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
