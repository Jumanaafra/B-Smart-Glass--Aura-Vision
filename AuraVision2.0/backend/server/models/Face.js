// server/models/Face.js
const mongoose = require('mongoose');

const FaceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    default: '',
  },
  relationship: {
    type: String,
    default: 'Known',
  },
  // 🔥 புதுசா இதைச் சேரு (AI Face Data):
  descriptor: { 
    type: [Number], 
    required: true 
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Face', FaceSchema);
