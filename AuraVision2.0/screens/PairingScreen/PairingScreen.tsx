// screens/PairingScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Page } from '../../types';
import { Icon } from '../../components/Icon';
import { Toggle } from '../../components/Toggle';
import './PairingScreen.css';

interface PairingScreenProps {
  setPage: (page: Page) => void;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ setPage }) => {
    const [step1Done, setStep1Done] = useState(true);
    const [step2Done, setStep2Done] = useState(false);
    const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const startScan = async () => {
            if (isScanning) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                    // Simulate scanning
                    setTimeout(() => {
                        setStep2Done(true);
                        setIsScanning(false); 
                    }, 3000);
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    alert("Could not access the camera. Please check permissions.");
                    setIsScanning(false);
                }
            }
        };
        startScan();

        return () => {
            // Cleanup: stop camera when component unmounts or isScanning becomes false
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isScanning]);

    const handleScanClick = () => {
        setIsScanning(true);
    };

    const handleCancelScan = () => {
        setIsScanning(false);
    };
    
    if (isScanning) {
        return (
            <div className="scan-overlay">
                <video ref={videoRef} autoPlay playsInline className="scan-video"></video>
                <div className="scan-overlay-dim"></div>
                <div className="scan-content">
                    <p className="scan-title">Scan QR Code</p>
                    <div className="scan-box">
                        <div className="scan-corner scan-corner-tl"></div>
                        <div className="scan-corner scan-corner-tr"></div>
                        <div className="scan-corner scan-corner-bl"></div>
                        <div className="scan-corner scan-corner-br"></div>
                    </div>
                     <p className="scan-subtitle">Point your camera at the QR code displayed on your IRIS Glass.</p>
                </div>
                <button onClick={handleCancelScan} className="scan-cancel-button">Cancel</button>
            </div>
        );
    }

  return (
    <div className="pairing-container">
      <header className="pairing-header">
        <button onClick={() => setPage(Page.IMPAIRED_LOGIN)} className="back-button">
            <Icon name="arrowLeft" className="back-button-icon" />
        </button>
        <h1 className="pairing-title">Pair Your IRIS Glass</h1>
      </header>

      <div className="pairing-body">
        <div className="pairing-icons-container">
            <div className="icon-box">
                <Icon name="glasses" className="icon-box-glasses"/>
            </div>
            <div className="icon-dots">...</div>
            <div className="icon-box">
                <span className="icon-box-phone">📱</span>
            </div>
        </div>

        <div className="steps-container">
            <div className="step-item">
                <div className="step-info">
                    <div className="step-number">1</div>
                    <div className="step-text">
                        <h2>Turn on your Glass</h2>
                        <p>Press and hold the power button.</p>
                    </div>
                </div>
                <div className="step-action">
                    {step1Done && <Icon name="checkCircle" className="check-icon"/>}
                </div>
            </div>
             <div className="step-item">
                <div className="step-info">
                    <div className="step-number">2</div>
                    <div className="step-text">
                        <h2>Scan QR Code</h2>
                        <p>Point your phone's camera at the glass.</p>
                    </div>
                </div>
                <div className="step-action">
                    {step2Done ? (
                        <Icon name="checkCircle" className="check-icon"/>
                    ) : (
                        <button onClick={handleScanClick} className="scan-button">Scan</button>
                    )}
                </div>
            </div>
             <div className="step-item">
                <div className="step-info">
                    <div className="step-number">3</div>
                    <div className="step-text">
                        <h2>Enable Bluetooth</h2>
                        <p>Make sure Bluetooth is active.</p>
                    </div>
                </div>
                <div className="step-action">
                    <Toggle checked={bluetoothEnabled} onChange={setBluetoothEnabled} />
                </div>
            </div>
        </div>
      </div>
      
      <div className="pairing-footer">
        <button onClick={() => setPage(Page.IMPAIRED_MAIN)} className="pair-button">
            Find and Pair Device
        </button>
        <button onClick={() => setPage(Page.HELP)} className="help-button">
            Need Help?
        </button>
      </div>
    </div>
  );
};