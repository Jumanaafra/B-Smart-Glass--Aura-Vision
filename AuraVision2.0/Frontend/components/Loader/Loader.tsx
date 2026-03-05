import React from 'react';
import './Loader.css';

interface LoaderProps {
    message?: string;
    fullScreen?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({ message = 'Loading...', fullScreen = false }) => {
    return (
        <div className={`loader-container ${fullScreen ? 'full-screen' : ''}`}>
            <div className="spinner"></div>
            {message && <p className="loader-text">{message}</p>}
        </div>
    );
};
