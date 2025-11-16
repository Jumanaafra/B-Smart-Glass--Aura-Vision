// screens/AddPersonScreen/AddPersonScreen.tsx

import React, { useState, useRef } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import './AddPersonScreen.css';

interface AddPersonScreenProps {
  setPage: (page: Page) => void;
}

export const AddPersonScreen: React.FC<AddPersonScreenProps> = ({ setPage }) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [name, setName] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null); // போட்டோ பிரிவியூ
  const [isLoading, setIsLoading] = useState(false);
  
  // Hidden file input-க்கான ரெஃபரன்ஸ்
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Upload Photo" பட்டனை கிளிக் பண்ணா, இது நடக்கும்
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // போட்டோ செலக்ட் பண்ண உடனே இது நடக்கும்
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string); // போட்டோவை Base64 ஆக மாற்றி சேவ் பண்றோம்
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!name) return;
    
    // லாகின் செய்துள்ள Guide-ஐ எடுக்கிறோம்
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
        alert("Please login first!");
        setPage(Page.GUIDE_LOGIN);
        return;
    }
    const currentUser = JSON.parse(userStr);

    setIsLoading(true);

    try {
        // --- API CALL (Backend-க்கு அனுப்புகிறோம்) ---
        const response = await fetch('https://b-smart-glass-aura-vision.onrender.com/api/faces/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser._id,
                name: name,
                // போட்டோ இருந்தால் அதை அனுப்புவோம், இல்லனா ஒரு டம்மி படம்
                imageUrl: imagePreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
                relationship: 'Known'
            }),
        });

        const data = await response.json();

        if (response.ok) {
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                setPage(Page.GUIDE_MAIN);
            }, 2000);
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

  return (
    <div className="ap-container">
      <header className="ap-header">
        <button onClick={() => setPage(Page.GUIDE_MAIN)} className="ap-back-button">
          <Icon name="arrowLeft" className="ap-back-button-icon" />
        </button>
        <h1 className="ap-title">Add New Person</h1>
      </header>

      <div className="ap-body">
        {/* மறைமுகமாக இருக்கும் File Input */}
        <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept="image/*" 
            onChange={handleFileChange} 
        />

        <div className="ap-upload-box" onClick={handleUploadClick}>
            {imagePreview ? (
                // போட்டோ செலக்ட் பண்ணியிருந்தால், அதை காட்டுவோம்
                <img src={imagePreview} alt="Preview" className="ap-image-preview" />
            ) : (
                // போட்டோ இல்லனா, பழைய டிசைனை காட்டுவோம்
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
      </div>
      
      <div className="ap-footer">
        <button 
          onClick={handleSave}
          className="ap-save-button"
          disabled={!name || isLoading}
        >
            {isLoading ? 'Saving...' : 'Save to Database'}
        </button>
        {showSuccess && (
            <div className="ap-success-message">
                {name} added successfully
            </div>
        )}
      </div>
    </div>
  );

};
