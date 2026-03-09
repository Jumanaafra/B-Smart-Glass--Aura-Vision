// backend/server/models/User.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { type: String, enum: ['VI', 'GUIDE'], required: true, default: 'VI' },
  deviceId: { type: String, default: '' },

  lastLocation: {
    lat: { type: Number, default: 13.0827 }, // Default Chennai
    lng: { type: Number, default: 80.2707 }
  },

  safeZone: {
    lat: { type: Number },
    lng: { type: Number },
    radiusInMeters: { type: Number, default: 500 },
    enabled: { type: Boolean, default: false }
  },

  // Settings & accessibility options
  settings: {
    darkMode: { type: Boolean, default: true },
    hapticFeedback: { type: Boolean, default: true },
    narrationSpeed: { type: Number, default: 50 },
    lowBatteryAlerts: { type: Boolean, default: true },
    connectionStatus: { type: Boolean, default: false },
    guideMessages: { type: Boolean, default: true },
    voiceNarration: { type: Boolean, default: true },
    highContrast: { type: Boolean, default: false },
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
