// screens/AddPersonScreen/AddPersonScreen.tsx
import React, { useState, useEffect, useRef } from 'react';

import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { Loader } from '../../components/Loader/Loader';
import { facesAPI, userAPI } from '../../utils/api';
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
  const [editingFaceId, setEditingFaceId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSavedFaces();
  }, []);

  /**
   * Resolves the target userId for face storage.
   * For a Guide: always the connected VI user's _id (resolved via API if not cached).
   * For a VI user: their own _id.
   * Returns null if resolution fails — caller must abort the operation.
   */
  const getTargetUserId = async (): Promise<string | null> => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    const currentUser = JSON.parse(userStr);

    if (currentUser.userType !== 'GUIDE') {
      return currentUser._id;
    }

    // Guide: always use VI user's _id
    const cached = localStorage.getItem('connectedVIId');
    if (cached) return cached;

    // Not cached — fetch from backend
    try {
      const viRes = await userAPI.getConnectedVI();
      if (viRes.ok) {
        const viData = await viRes.json();
        localStorage.setItem('connectedVIId', viData._id);
        return viData._id;
      }
    } catch (e) {
      console.error('Failed to resolve connected VI user', e);
    }
    return null;
  };

  const fetchSavedFaces = async () => {
    try {
      const targetUserId = await getTargetUserId();
      if (!targetUserId) return;

      const res = await facesAPI.getFaces(targetUserId);
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

    setIsLoading(true);
    try {
      const targetUserId = await getTargetUserId();
      if (!targetUserId) {
        alert('Could not resolve the VI user. Please ensure you are logged in and paired to a VI user.');
        setIsLoading(false);
        return;
      }

      let response;
      if (editingFaceId) {
        response = await facesAPI.updateFace(
          editingFaceId,
          name,
          imagePreview
        );
      } else {
        response = await facesAPI.addPerson(
          targetUserId,
          name,
          imagePreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
        );
      }

      const data = await response.json();

      if (response.ok) {
        setShowSuccess(true);
        setName('');
        setImagePreview(null);
        setEditingFaceId(null);
        await fetchSavedFaces();
        setTimeout(() => {
          setShowSuccess(false);
        }, 3000);
      } else {
        alert(data.message || "Failed to save person");
      }

    } catch (error) {
      console.error("Error saving person:", error);
      alert("Server error. Check if backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (faceId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this face?");
    if (!confirmDelete) return;

    setIsLoading(true);
    try {
      const response = await facesAPI.deleteFace(faceId);
      if (response.ok) {
        if (editingFaceId === faceId) {
          setEditingFaceId(null);
          setName('');
          setImagePreview(null);
        }
        await fetchSavedFaces();
      } else {
        const data = await response.json();
        alert(data.message || "Failed to delete face");
      }
    } catch (err) {
      console.error("Delete Error", err);
      alert("Error connecting to server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (face: any) => {
    setEditingFaceId(face._id);
    setName(face.name);
    setImagePreview(face.imageUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isLimitReached = savedFaces.length >= 10 && !editingFaceId;

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
            Limit reached. You can only save up to 10 faces.
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

            {isLoading && <Loader message="Processing Face Encoding..." fullScreen={true} />}

            <div className="ap-footer">
              <button
                onClick={handleSave}
                className="ap-save-button"
                disabled={!name || (!imagePreview && !editingFaceId) || isLoading}
              >
                {isLoading ? 'Saving...' : (editingFaceId ? 'Update Face' : 'Add Face')}
              </button>
              {editingFaceId && (
                <button
                  onClick={() => { setEditingFaceId(null); setName(''); setImagePreview(null); }}
                  className="ap-cancel-button"
                  style={{ marginTop: '10px', backgroundColor: '#e5e5ea', color: '#1c1c1e', width: '100%', padding: '16px', borderRadius: '16px', border: 'none', fontSize: '1.0625rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel Edit
                </button>
              )}
              {showSuccess && (
                <div className="ap-success-message">
                  {editingFaceId ? 'Person updated successfully!' : 'Person added successfully!'}
                </div>
              )}
            </div>
          </>
        )}

        {/* --- Face Gallery --- */}
        <div className="ap-gallery-header">
          <h2 className="ap-gallery-title">Saved Faces</h2>
          <span className="ap-gallery-count">{savedFaces.length}/10</span>
        </div>

        <div className="ap-gallery-list">
          {savedFaces.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#8E8E93', fontSize: '0.875rem' }}>No faces added yet.</p>
          ) : (
            savedFaces.map((face) => (
              <div key={face._id} className="ap-gallery-item" style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src={face.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${face.name}`}
                  alt={face.name}
                  className="ap-gallery-image"
                />
                <span className="ap-gallery-name" style={{ flex: 1, marginLeft: '12px' }}>{face.name}</span>
                <div className="ap-gallery-actions" style={{ display: 'flex', gap: '16px', paddingRight: '8px' }}>
                  <button onClick={() => handleEditClick(face)} style={{ background: 'none', border: 'none', color: '#007aff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => handleDelete(face._id)} style={{ background: 'none', border: 'none', color: '#ff3b30', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
