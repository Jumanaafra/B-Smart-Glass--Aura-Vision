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

const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ── COOKIE OPTIONS ────────────────────────────────────────────────────────────
// httpOnly: JS cannot read this cookie (prevents XSS token theft)
// secure:   Only sent over HTTPS (disabled in dev)
// sameSite: 'lax' works when frontend and backend share same origin via Vite proxy
const cookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
};

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
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
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
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

// ── HELPER: Set JWT Cookie ────────────────────────────────────────────────────
const setTokenCookie = (res, user) => {
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, userType: user.userType },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  // Set as HttpOnly cookie — JS cannot access this
  res.cookie('token', token, cookieOptions);
  return token;
};

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
/**
 * Reads JWT from:
 *  1. httpOnly cookie `token`  ← preferred (browser clients)
 *  2. Authorization: Bearer <token> header  ← fallback (Postman, mobile, curl)
 */
const authenticateToken = (req, res, next) => {
  // 1. Try cookie first
  let token = req.cookies?.token;

  // 2. Fall back to Authorization header
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Please log in.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET); // { id, email, userType }
    next();
  } catch (err) {
    // Clear a bad cookie automatically
    res.clearCookie('token', { path: '/' });
    return res.status(403).json({ message: 'Session expired. Please log in again.' });
  }
};

// ── SOCKET.IO EVENTS ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('📱 A user connected:', socket.id);
  
  socket.on('send-video-frame', (data) => {
      socket.broadcast.emit('receive-video-frame', data);
  });
  
  socket.on('send-location', async (data) => {
    socket.broadcast.emit('receive-location', data);
    if (data.deviceId) {
      User.findOneAndUpdate(
        { deviceId: data.deviceId },
        { $set: { lastLocation: { lat: data.lat, lng: data.lng } } }
      ).catch(err => console.error('Location Update Error:', err));
    }
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

    // ✅ Set JWT as HttpOnly cookie
    setTokenCookie(res, newUser);

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({ message: 'User registered successfully', user: userResponse });
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

    // ✅ Set JWT as HttpOnly cookie — token NOT sent in response body
    setTokenCookie(res, user);

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ message: 'Login successful', user: userResponse });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ── 3. LOGOUT ─────────────────────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
});

// ── 4. GET CURRENT USER (session restore) ─────────────────────────────────────
// Called on app load to check if user is already logged in via cookie
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      res.clearCookie('token', { path: '/' });
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
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
    if (!detection) {
      return res.status(400).json({ message: 'Could not detect a face. Try a clearer, well-lit photo.' });
    }

    const descriptor = Array.from(detection.descriptor);
    // Store the FULL imageBase64 so the frontend gallery has something to show
    const newFace = new Face({ userId, name, imageUrl: imageBase64, descriptor });
    await newFace.save();

    res.status(201).json({ message: 'Person added successfully', face: { _id: newFace._id, name: newFace.name, imageUrl: newFace.imageUrl } });
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

      // Fallback to Vision
      if (!finalResponse) {
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

      // Fallback to Vision if not Face match or if mode is Vision
      if (!finalResponse) {
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
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required.' });

    console.log('💬 Ask ChatGPT:', message);
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective for general chat
      messages: [ // No history context injected yet, just raw message
        { role: "system", content: "You are a helpful and concise assistant inside a smart glasses companion app." },
        { role: "user", content: message }
      ],
      max_tokens: 200
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
