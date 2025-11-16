// server/models/Face.js

const mongoose = require('mongoose');

const FaceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, // Ethu guide aanu add cheythathu ennu ariyan
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String, // Photo URL (Simulated)
    default: '',
  },
  relationship: {
    type: String,
    default: 'Known',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Face', FaceSchema);