// backend/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const http = require('http'); 
const { Server } = require("socket.io"); // Socket.io Import

// Models
const User = require('./models/User');
const Face = require('./models/Face');

dotenv.config();
const app = express();

// Socket.io Setup 
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(cors());

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- OPENAI SETUP ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// --- SOCKET.IO LOGIC (UPDATED) ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 1. Blind User 
  socket.on('send-video-frame', (data) => {
   
    socket.broadcast.emit('receive-video-frame', data);
  });

  // 2. Blind User 
  socket.on('send-location', async (data) => {
    // A.(Live Tracking)
    socket.broadcast.emit('receive-location', data);

    // B. Database-ல(Offline-ல் )
    if (data.deviceId) {
      try {்
        await User.findOneAndUpdate(
          { deviceId: data.deviceId, userType: 'VISUALLY_IMPAIRED' },
          { $set: { lastLocation: { lat: data.lat, lng: data.lng } } }
        );
      } catch (err) {
        console.error("Error saving location:", err);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// --- ROUTES ---

// NEW API:
app.get('/api/location/:deviceId', async (req, res) => {
  try {
    
    const user = await User.findOne({ deviceId: req.params.deviceId, userType: 'VISUALLY_IMPAIRED' });
    
    if (user && user.lastLocation && user.lastLocation.lat) {
      res.json(user.lastLocation);
    } else {
      // User Default Chennai
      res.json({ lat: 13.0827, lng: 80.2707 }); 
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. AUTH: Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, userType, deviceId } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });
    const newUser = new User({ fullName, email, password, userType, deviceId });
    await newUser.save();
    res.status(201).json({ message: "User registered", user: newUser });
  } catch (error) { res.status(500).json({ message: "Server Error", error: error.message }); }
});

// 2. AUTH: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.password !== password) return res.status(400).json({ message: "Invalid credentials" });
    res.json({ message: "Login successful", user });
  } catch (error) { res.status(500).json({ message: "Server Error", error: error.message }); }
});

// 3. USER: Get Profile
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) { res.status(500).json({ message: "Error fetching user" }); }
});

// 4. USER: Update Settings
app.put('/api/user/:id/settings', async (req, res) => {
  try {
    const { settings } = req.body; 
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { settings: settings } }, { new: true });
    res.json({ message: "Settings updated", user });
  } catch (error) { res.status(500).json({ message: "Error updating settings" }); }
});

// 5. FACES: Add New Person
app.post('/api/faces/add', async (req, res) => { 
    try {
        const { userId, name, imageUrl } = req.body;
        const newFace = new Face({ userId, name, imageUrl });
        await newFace.save();
        res.status(201).json({ message: "Person added", face: newFace });
    } catch(e) { res.status(500).json({error: e.message}) }
});

// 6. FACES: Get All People
app.get('/api/faces/:userId', async (req, res) => { 
    try {
        const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(faces);
    } catch(e) { res.status(500).json({error: e.message}) }
});

// 7. AI: Describe Image (Tanglish/English Support)
app.post('/api/ai/describe', async (req, res) => {
  try {
    const { imageBase64, prompt, language } = req.body; // language

    const imageContent = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:image/jpeg;base64,${imageBase64}`;

    // AI- (System Prompt)
    let systemInstruction = "You are Aura, a helpful vision assistant for a visually impaired person. Keep your answers short, kind, and direct.";
    
    if (language === 'TG') {
        systemInstruction += " IMPORTANT: Reply in 'Tanglish' (Tamil language written in English alphabet). Example: 'Ungalukku munnadi oru laptop irukku.', 'Anga oru chair irukku.'. Do NOT use Tamil script, use only English letters.";
    } else {
        systemInstruction += " Reply in clear, simple English.";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "What is in front of me?" },
            { type: "image_url", image_url: { url: imageContent } },
          ],
        },
      ],
      max_tokens: 150,
    });

    res.json({ description: response.choices[0].message.content });
  } catch (error) {
    console.error("AI Vision Error:", error);
    res.status(500).json({ message: "AI Error", error: error.message });
  }
});

// 8. AI: Chat (Guide)
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ message: "AI Error", error: error.message });
  }
});

// Start Server (: app.listen  server.listen)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Socket Server running on http://localhost:${PORT}`);
});
