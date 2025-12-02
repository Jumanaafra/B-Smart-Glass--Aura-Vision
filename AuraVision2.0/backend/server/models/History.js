// backend/server/models/History.js

const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['VOICE', 'LOCATION'], required: true }, // Voice-ஆ இல்ல Location-ஆ?
  content: { type: String }, // Voice Command text
  location: { // Location data
    lat: Number,
    lng: Number,
    address: String 
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('History', HistorySchema);
