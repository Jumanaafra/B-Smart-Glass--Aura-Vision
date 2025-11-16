// backend/server/models/User.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { type: String, enum: ['VISUALLY_IMPAIRED', 'GUIDE'], required: true, default: 'VISUALLY_IMPAIRED' },
  deviceId: { type: String, default: '' },

  // Settings & accessibility options
  settings: {
    darkMode: { type: Boolean, default: true },
    hapticFeedback: { type: Boolean, default: true },
    narrationSpeed: { type: Number, default: 50 }, // 0-100 scale
    lowBatteryAlerts: { type: Boolean, default: true },
    connectionStatus: { type: Boolean, default: false },
    guideMessages: { type: Boolean, default: true },

    // Additional accessibility options
    voiceNarration: { type: Boolean, default: true },
    highContrast: { type: Boolean, default: false },
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
