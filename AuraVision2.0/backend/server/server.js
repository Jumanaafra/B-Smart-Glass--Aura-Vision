// backend/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const OpenAI = require('openai');
const http = require('http');
const { Server } = require("socket.io");

// Face API & Canvas (Native dependencies - wrapped in try/catch for compatibility)
let Canvas, Image, ImageData, faceapi;
try {
  const canvas = require('canvas');
  Canvas = canvas.Canvas;
  Image = canvas.Image;
  ImageData = canvas.ImageData;
  faceapi = require('@vladmandic/face-api');
  console.log('✅ Face-API & Canvas modules loaded');
} catch (err) {
  console.warn('⚠️  Face-API or Canvas modules failed to load. Face recognition will be disabled.');
  console.warn('   Reason:', err.message);
}

// Models
const User = require('./models/User');
const Face = require('./models/Face');
const History = require('./models/History');

dotenv.config();
const app = express();
app.set('trust proxy', 1); // <--- CRITICAL for Render! Allows secure cookies behind reverse proxy

const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ── COOKIE OPTIONS ────────────────────────────────────────────────────────────
// httpOnly: JS cannot read this cookie (prevents XSS token theft)
// secure:   Only sent over HTTPS (disabled in dev)
// sameSite: 'none' is REQUIRED when frontend (Vercel) and backend (Render) are on different domains
const cookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
};

// ── CORS ──────────────────────────────────────────────────────────────────────
// Dynamically allow the requesting origin to solve Vercel preview URL mismatches
app.use(cors({
  origin: true, // true safely reflects the requesting origin back
  credentials: true, // Required to allow cookies in cross-origin requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());                             // Parse cookies from requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
});

// ── MONGODB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected to:', process.env.MONGO_URI))
  .catch((err) => console.error('❌ MongoDB Error:', err));

// ── OPENAI (ChatGPT) ────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── FACE-API ──────────────────────────────────────────────────────────────────
if (faceapi) {
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
}

async function loadFaceModels() {
  if (!faceapi) return;
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./weights');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./weights');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./weights');
    console.log('✅ Face-API Models Loaded!');
  } catch (err) {
    console.warn('⚠️  Face-API weights missing. Place model files in ./weights/ to enable face recognition.');
  }
}
loadFaceModels();

// ── HELPER: Generate JWT Token ────────────────────────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, userType: user.userType },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
/**
 * Reads JWT from Authorization: Bearer <token> header
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Please log in.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET); // { id, email, userType }
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Session expired. Please log in again.' });
  }
};

// ── SOCKET.IO EVENTS ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('📱 A user connected:', socket.id);

  socket.on('send-video-frame', (data) => {
    socket.broadcast.emit('receive-video-frame', data);
  });

  // WebRTC Signaling Events
  socket.on('request-webrtc', () => {
    socket.broadcast.emit('request-webrtc');
  });
  socket.on('webrtc-offer', (data) => {
    socket.broadcast.emit('webrtc-offer', data);
  });
  socket.on('webrtc-answer', (data) => {
    socket.broadcast.emit('webrtc-answer', data);
  });
  socket.on('webrtc-candidate', (data) => {
    socket.broadcast.emit('webrtc-candidate', data);
  });

  socket.on('send-location', async (data) => {
    socket.broadcast.emit('receive-location', data);
    if (data.deviceId) {
      try {
        const user = await User.findOneAndUpdate(
          { deviceId: data.deviceId },
          { $set: { lastLocation: { lat: data.lat, lng: data.lng } } },
          { new: true }
        );

        // Geofencing Check
        if (user && user.safeZone && user.safeZone.enabled && user.safeZone.lat && user.safeZone.lng) {
          const R = 6371e3; // Earth radius in meters
          const φ1 = user.safeZone.lat * Math.PI / 180;
          const φ2 = data.lat * Math.PI / 180;
          const Δφ = (data.lat - user.safeZone.lat) * Math.PI / 180;
          const Δλ = (data.lng - user.safeZone.lng) * Math.PI / 180;

          const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;

          if (distance > user.safeZone.radiusInMeters) {
            socket.broadcast.emit('geofence-alert', {
              userId: user._id,
              distance: Math.round(distance),
              lat: data.lat,
              lng: data.lng
            });
          }
        }
      } catch (err) {
        console.error('Location Update Error:', err);
      }
    }
  });

  socket.on('sos-alert', (data) => {
    socket.broadcast.emit('sos-alert', data);
  });

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. REGISTER ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, userType, deviceId } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      userType: userType || 'VISUALLY_IMPAIRED',
      deviceId: deviceId || '',
    });
    await newUser.save();

    // ✅ Generate JWT to send in response body
    const token = generateToken(newUser);

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({ message: 'User registered successfully', token, user: userResponse });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 2. LOGIN ──────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email.' });
    }

    // Support both bcrypt-hashed and legacy plain-text passwords
    let passwordMatch = false;
    if (user.password.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      passwordMatch = (user.password === password);
      if (passwordMatch) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        console.log('🔑 Upgraded plain-text password to bcrypt for user:', user.email);
      }
    }

    if (!passwordMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // ✅ Generate JWT to send in response body
    const token = generateToken(user);

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ message: 'Login successful', token, user: userResponse });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 3. LOGOUT ─────────────────────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// ── 4. GET CURRENT USER (session restore) ─────────────────────────────────────
// Called on app load to check if user is already logged in via token
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ user });
  } catch (error) {
    console.error('/me Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 5. FORGOT PASSWORD ────────────────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: `If an account exists for ${email}, a reset link has been sent.` });
    }

    const resetToken = jwt.sign(
      { id: user._id.toString(), purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // TODO: In production, send via email (nodemailer / SendGrid)
    console.log(`\n🔑 Password Reset Token for ${email}:\n${resetToken}`);
    console.log(`Reset link: http://localhost:3000/reset-password?token=${resetToken}\n`);

    res.json({ message: `If an account exists for ${email}, a reset link has been sent.` });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROTECTED ROUTES (require valid cookie or Authorization header)
// ═══════════════════════════════════════════════════════════════════════════════

// ── 6. CHANGE PASSWORD ────────────────────────────────────────────────────────
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (req.user.id !== userId) return res.status(403).json({ message: 'Forbidden.' });
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 7. GET USER PROFILE ───────────────────────────────────────────────────────
app.get('/api/user/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) return res.status(403).json({ message: 'Forbidden.' });
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({ message: 'Error fetching user.' });
  }
});

// ── 8. UPDATE USER SETTINGS ───────────────────────────────────────────────────
app.put('/api/user/:id/settings', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) return res.status(403).json({ message: 'Forbidden.' });
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ message: 'Settings object is required.' });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { settings } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'Settings updated successfully.', user });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 8B. UPDATE SAFE ZONE ───────────────────────────────────────────────────
app.put('/api/user/:id/safezone', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) return res.status(403).json({ message: 'Forbidden.' });
    const { safeZone } = req.body;
    if (!safeZone) return res.status(400).json({ message: 'safeZone object is required.' });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { safeZone } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'Safe Zone updated successfully.', user });
  } catch (error) {
    console.error('Update Safe Zone Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 9. ADD FACE ───────────────────────────────────────────────────────────────
app.post('/api/faces/add', authenticateToken, async (req, res) => {
  try {
    const { userId, name, imageBase64 } = req.body; // Frontend sends 'imageBase64'

    if (req.user.id !== userId) return res.status(403).json({ message: 'Forbidden.' });
    if (!name || !imageBase64) return res.status(400).json({ message: 'Name and image are required.' });

    // ENFORCE LIMIT: Max 5 faces per user for the testing phase
    const count = await Face.countDocuments({ userId: req.user.id });
    if (count >= 5) {
      return res.status(400).json({ message: 'Limit Reached: You can only add up to 5 faces during the testing phase.' });
    }

    if (!faceapi) {
      return res.status(503).json({ error: 'Face recognition service is unavailable on this server.' });
    }

    console.log('Generating face encoding for:', name);
    const img = new Image();

    // STRICT FORMAT: faceapi canvas Image expects data URLs, not raw base64. Ensure it has prefix.
    const cleanImgSrc = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    img.src = cleanImgSrc;

    // Small delay to ensure native Canvas processes imageSrc fully
    setTimeout(async () => {
      try {
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
          return res.status(400).json({ message: 'Could not detect a face. Try a clearer, well-lit photo.' });
        }

        const descriptor = Array.from(detection.descriptor);
        const newFace = new Face({ userId, name, imageUrl: cleanImgSrc, descriptor });
        await newFace.save();

        res.status(201).json({ message: 'Person added successfully', face: { _id: newFace._id, name: newFace.name, imageUrl: newFace.imageUrl } });
      } catch (err) {
        console.error('Face Detection Logic Error:', err);
        res.status(500).json({ error: 'Failed to process face encoding: ' + err.message });
      }
    }, 100);
  } catch (e) {
    console.error('Add Face Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── 10. GET ALL FACES ─────────────────────────────────────────────────────────
app.get('/api/faces/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'Forbidden.' });
    const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(faces);
  } catch (e) {
    console.error('Get Faces Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── 10b. UPDATE FACE ─────────────────────────────────────────────────────────
app.put('/api/faces/:faceId', authenticateToken, async (req, res) => {
  try {
    const { name, imageBase64 } = req.body;

    const face = await Face.findById(req.params.faceId);
    if (!face) return res.status(404).json({ message: 'Face not found.' });
    if (req.user.id !== face.userId.toString()) return res.status(403).json({ message: 'Forbidden.' });

    if (name) face.name = name;

    if (imageBase64) {
      if (!faceapi) {
        return res.status(503).json({ error: 'Face recognition service is unavailable on this server.' });
      }

      console.log('Updating face encoding for:', name || face.name);
      const img = new Image();
      img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      if (!detection) {
        return res.status(400).json({ message: 'Could not detect a face in new image. Try a clearer, well-lit photo.' });
      }

      face.descriptor = Array.from(detection.descriptor);
      face.imageUrl = imageBase64;
    }

    await face.save();
    res.json({ message: 'Face updated successfully', face: { _id: face._id, name: face.name, imageUrl: face.imageUrl } });
  } catch (e) {
    console.error('Update Face Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── 10c. DELETE FACE ─────────────────────────────────────────────────────────
app.delete('/api/faces/:faceId', authenticateToken, async (req, res) => {
  try {
    const face = await Face.findById(req.params.faceId);
    if (!face) return res.status(404).json({ message: 'Face not found.' });
    if (req.user.id !== face.userId.toString()) return res.status(403).json({ message: 'Forbidden.' });

    await Face.findByIdAndDelete(req.params.faceId);
    res.json({ message: 'Face deleted successfully.' });
  } catch (e) {
    console.error('Delete Face Error:', e);
    res.status(500).json({ error: e.message });
  }
});


// ── 11. PROCESS IMAGE (Face Rec + Gemini) ─────────────────────────────────────
const processImageHandler = async (req, res) => {
  try {
    const { imageBase64, prompt, userId, language, mode = 'vision' } = req.body;

    if (mode !== 'chat' && !imageBase64) {
      return res.status(400).json({ message: 'imageBase64 is required for vision/face modes.' });
    }

    let finalResponse = '';

    // Mode: CHAT (Fast Text Only)
    if (mode === 'chat' || !imageBase64) {
      console.log('💬 Web Mode: CHAT');
      const systemPrompt = language === 'TG'
        ? "You are a helpful assistant for a blind person. Reply in 'Tanglish' (Tamil words in English letters). Keep it short."
        : 'You are a helpful assistant for a blind person. Reply in simple English. Keep it short.';

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt || "Hello Aura" }
        ],
        max_tokens: 150
      });
      finalResponse = aiResponse.choices[0].message.content;
    }
    // Mode: FACE or VISION
    else {
      console.log(`📸 Web Mode: ${mode.toUpperCase()}`);

      // Try Face Recognition FIRST if explicitly requested
      if (mode === 'face' && faceapi) {
        try {
          const img = new Image();
          img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
          const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

          if (detection) {
            const faces = await Face.find({ userId }).select('name descriptor');
            const validFaces = faces.filter(f => f.descriptor && f.descriptor.length > 0);

            if (validFaces.length > 0) {
              const labeledDescriptors = validFaces.map(f =>
                new faceapi.LabeledFaceDescriptors(f.name, [new Float32Array(f.descriptor)])
              );
              const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
              const match = faceMatcher.findBestMatch(detection.descriptor);

              if (match.label !== 'unknown') {
                finalResponse = language === 'TG'
                  ? `${match.label} unga pakkathula irukkaru.`
                  : `${match.label} is nearby you.`;
              }
            }
          }
        } catch (e) {
          console.log('⚠️ Web Face Rec error:', e.message);
        }
      }

      // Fallback to Vision or OCR
      if (!finalResponse) {
        if (mode === 'ocr') {
          console.log('📖 Web asking ChatGPT OCR...');
          const systemPrompt = language === 'TG'
            ? "You are reading text for a blind person. Read any text visible in the image loud and clear. If there is a lot of text, summarize the headings. Reply in 'Tanglish' (Tamil words in English letters)."
            : "You are reading text for a blind person. Read any text visible in the image loud and clear. If there is a lot of text, summarize the key points. Reply in simple English.";

          const formattedImage = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: prompt || 'Read the text in this image.' },
                  { type: "image_url", image_url: { url: formattedImage, detail: "high" } } // High detail better for OCR
                ]
              }
            ],
            max_tokens: 300
          });
          finalResponse = aiResponse.choices[0].message.content;
        } else {
          console.log('🤖 Web asking ChatGPT Vision...');
          const systemPrompt = language === 'TG'
            ? "You are a vision assistant guiding a blind person. Reply in 'Tanglish' (Tamil words in English letters). Keep it short and helpful."
            : 'You are a vision assistant guiding a blind person. Reply in simple English. Keep it short and helpful.';

          const formattedImage = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: prompt || 'Describe this scene briefly.' },
                  { type: "image_url", image_url: { url: formattedImage, detail: "low" } }
                ]
              }
            ],
            max_tokens: 150
          });
          finalResponse = aiResponse.choices[0].message.content;
        }
      }
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      await new History({ userId, type: 'VOICE', content: prompt || 'Visual Query', aiResponse: finalResponse }).save();
    }

    console.log('📤 Sending Response:', finalResponse.substring(0, 80));
    res.json({ description: finalResponse });
  } catch (error) {
    console.error('❌ Processing Error:', error.message);
    res.status(500).json({ message: 'Processing Error', error: error.message });
  }
};

app.post('/api/process-image', authenticateToken, processImageHandler);

// ── 11b. HARDWARE DEVICE ROUTE (Bypasses web cookies) ─────────────────────────
app.post('/api/ai/describe', async (req, res) => {
  try {
    const { imageBase64, prompt, userId, lat, lng, mode } = req.body;

    // Strict Hardware Instructions
    const systemInstruction = `
      You are 'Aura', an emergency visual guide for a visually impaired user.
      Your ONLY job is to keep them safe and tell them what is directly in front of them.
      STRICT RULES:
      1. **HAZARDS FIRST:** If you see vehicles, stairs, potholes, or obstacles, warn them IMMEDIATELY.
      2. **DIRECTIONAL GUIDANCE:** Use clock positions or Left/Right/Center.
      3. **SUPER SHORT:** Keep it under 10 words. Audio is slow, you must be fast and precise.
      4. **LANGUAGE:** Reply EXACTLY in the language the user speaks. If Tanglish, use simple words like "Munnadi, Valadhu, Idadhu, Nillunga".
    `;

    let finalResponse = '';

    // Mode: CHAT (Fast Text Only)
    if (mode === 'chat' || !imageBase64) {
      console.log('💬 Hardware Mode: CHAT');
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt || "Hello Aura" },
        ],
        max_tokens: 150,
      });
      finalResponse = aiResponse.choices[0].message.content;
    }
    // Mode: FACE or VISION
    else {
      console.log(`📸 Hardware Mode: ${mode.toUpperCase()}`);

      // Check Face Recognition FIRST
      if (mode === 'face' && faceapi) {
        try {
          const img = new Image();
          img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
          const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

          if (detection) {
            const faces = await Face.find({ userId }).select('name descriptor');
            const validFaces = faces.filter(f => f.descriptor && f.descriptor.length > 0);

            if (validFaces.length > 0) {
              const labeledDescriptors = validFaces.map(f =>
                new faceapi.LabeledFaceDescriptors(f.name, [new Float32Array(f.descriptor)])
              );
              const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
              const match = faceMatcher.findBestMatch(detection.descriptor);

              if (match.label !== 'unknown') {
                // Return immediate match and skip OpenAI Vision
                finalResponse = prompt.toLowerCase().includes('tanglish')
                  ? `${match.label} unga pakkathula irukkaru.`
                  : `${match.label} is nearby you.`;
              }
            }
          }
        } catch (e) {
          console.log('⚠️ Hardware Face Rec error:', e.message);
        }
      }

      // Fallback to Vision if not Face match or if mode is Vision/OCR
      if (!finalResponse) {
        if (mode === 'ocr') {
          console.log('🤖 Hardware asking ChatGPT OCR...');
          const formattedImage = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Read any text visible in the image loud and clear. If there is a lot of text, summarize the key points." },
              {
                role: "user", content: [
                  { type: "text", text: prompt || "Read the text." },
                  { type: "image_url", image_url: { url: formattedImage, detail: "high" } }
                ]
              }
            ],
            max_tokens: 300,
          });
          finalResponse = aiResponse.choices[0].message.content;
        } else {
          console.log('🤖 Hardware asking ChatGPT Vision...');
          const formattedImage = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemInstruction },
              {
                role: "user", content: [
                  { type: "text", text: prompt || "Describe the scene for navigation." },
                  { type: "image_url", image_url: { url: formattedImage, detail: "low" } }
                ]
              }
            ],
            max_tokens: 150,
          });
          finalResponse = aiResponse.choices[0].message.content;
        }
      }
    }

    // Save GPS location to history log for caregivers
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      await new History({
        userId,
        type: 'VOICE',
        content: prompt || "Hardware Query",
        aiResponse: finalResponse,
        location: { lat: lat || 0, lng: lng || 0 }
      }).save();
    }

    console.log('📤 Hardware Response:', finalResponse.substring(0, 80));
    res.json({ description: finalResponse });

  } catch (error) {
    console.error('❌ Hardware Processing Error:', error.message);
    res.status(500).json({ message: "AI Error", error: error.message });
  }
});

// ── 12. AI CHAT ───────────────────────────────────────────────────────────────
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { viUserId, message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required.' });
    if (!viUserId) return res.status(400).json({ message: 'viUserId is required.' });

    // Fetch the VI User's data
    const viUser = await User.findById(viUserId);
    if (!viUser) {
      return res.status(404).json({ message: 'Visually Impaired user not found.' });
    }

    // Fetch the last 5 interactions for this user
    const historyLogs = await History.find({ userId: viUserId })
      .sort({ timestamp: -1 })
      .limit(5);

    // Summarize the interactions
    const historySummary = historyLogs.map((h, i) => {
      const time = h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : 'Unknown Time';
      let action = h.type === 'VOICE' ? `Asked: "${h.content}"` : `Location Update`;

      const aiResponse = h.get('aiResponse') || h.aiResponse;
      if (h.type === 'VOICE' && aiResponse) {
        action += ` -> AI replied: "${aiResponse}"`;
      }

      return `${i + 1}. [${time}] ${action}`;
    }).join('\n');

    const lat = viUser.lastLocation?.lat || 'unknown';
    const lng = viUser.lastLocation?.lng || 'unknown';

    let address = 'Location unavailable';
    if (lat !== 'unknown' && lng !== 'unknown') {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
          headers: { 'User-Agent': 'AuraVision-Backend/1.0' }
        });
        const geoData = await geoRes.json();
        if (geoData.display_name) {
          address = geoData.display_name;
        }
      } catch (err) {
        console.error('Reverse Geocoding Error:', err.message);
      }
    }

    // Construct a dynamic systemInstruction
    const systemInstruction = `
You are the "Aura Guide Assistant". Your purpose is to help the Guide (caretaker) answer questions about the Visually Impaired (VI) user they are monitoring.
You have access to the VI user's live context. Use this context to answer the Guide's query accurately. 
If the prompt asks where the user is, describe the location using the street and city details provided below.

[VI USER CONTEXT]
- Name: ${viUser.fullName}
- Current Location: ${address}
- GPS Coordinates: Latitude ${lat}, Longitude ${lng}
- Last 5 Interactions:
${historySummary || 'No recent interactions.'}
    `.trim();

    console.log(`💬 Ask Aura Guide Assistant for VI User (${viUser.fullName}):`, message);
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective for general chat
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message }
      ],
      max_tokens: 300
    });

    res.json({ reply: aiResponse.choices[0].message.content });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ message: 'AI Error', error: error.message });
  }
});

// ── 13. GET USER HISTORY ──────────────────────────────────────────────────────
app.get('/api/history/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'Forbidden.' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const history = await History.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json(history);
  } catch (error) {
    console.error('History Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 AuraVision Backend running at http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Cookies: httpOnly=true, secure=${IS_PROD}, sameSite=${IS_PROD ? 'strict' : 'lax'}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
