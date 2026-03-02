// backend/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const http = require('http'); 
const { Server } = require("socket.io"); 

// Models
const User = require('./models/User');
const Face = require('./models/Face');
const History = require('./models/History'); 

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  console.log('📱 A user connected:', socket.id);
  
  socket.on('send-video-frame', (data) => {
      socket.broadcast.emit('receive-video-frame', data);
  });
  
  socket.on('send-location', async (data) => {
    socket.broadcast.emit('receive-location', data);
    if (data.deviceId) {
      try {
        await User.findOneAndUpdate(
          { deviceId: data.deviceId, userType: 'VISUALLY_IMPAIRED' },
          { $set: { lastLocation: { lat: data.lat, lng: data.lng } } },
          { new: true } 
        );
      } catch (err) {
          console.error("Location Update Error:", err);
      }
    }
  });
  
  socket.on('disconnect', () => {
      console.log('❌ User disconnected');
  });
});

// --- ROUTES ---

// GET History
app.get('/api/history/:userId', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const history = await History.find({ userId: req.params.userId })
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        res.json(history);
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// 🔥 Add Face (Canvas/Face-API Removed) 🔥
app.post('/api/faces/add', async (req, res) => { 
    try {
        const { userId, name, imageUrl, base64Image } = req.body;
        
        // Directly saving to MongoDB without Face-API descriptors
        const newFace = new Face({ userId, name, imageUrl, base64Image });
        await newFace.save();
        
        res.status(201).json({ message: "Person added successfully", face: newFace });
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// Get Faces
app.get('/api/faces/:userId', async (req, res) => { 
    try {
        const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(faces);
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// Profile & Location 
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/location/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId });
        res.json({ location: user?.lastLocation || null });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/auth/register', async (req, res) => {
    res.json({ message: "Register endpoint active" });
});

app.post('/api/auth/login', async (req, res) => {
    res.json({ message: "Login endpoint active" });
});

app.put('/api/user/:id/settings', async (req, res) => {
    res.json({ message: "Settings updated" });
});

// 🔥 AI Describe (Using OpenAI Vision without Face-API) 🔥
app.post('/api/ai/describe', async (req, res) => {
  try {
    const { imageBase64, prompt, userId, lat, lng, mode } = req.body;

    const systemInstruction = `
      You are Aura, an intelligent visual assistant guiding a blind person in a public environment. 
      STRICT RULES:
      1. LANGUAGE MIRRORING: Reply in the language the user speaks.
      2. SAFETY FIRST: Warn about hazards.
      3. BE CONCISE: Keep response under 2 sentences.
    `;

    let userMessageContent;
    let finalPrompt = prompt || "Describe the scene for navigation.";
    
    if (mode === 'chat' || !imageBase64) {
        userMessageContent = prompt || "Hello Aura";
    } else {
        const imageContent = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        
        if (mode === 'face') {
            finalPrompt = `Describe the person's physical appearance, expression, and approximate age. Reply in the user's language. User query: ${prompt || "Who is this?"}`;
        }

        userMessageContent = [ 
            { type: "text", text: finalPrompt }, 
            { type: "image_url", image_url: { url: imageContent } } 
        ];
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: systemInstruction }, 
          { role: "user", content: userMessageContent }
      ],
      max_tokens: 150, 
    });

    const description = response.choices[0].message.content;

    if (userId) {
        await new History({ 
            userId, 
            type: 'VOICE', 
            content: prompt || "Visual Query", 
            location: { lat: lat || 0, lng: lng || 0 } 
        }).save();
    }

    res.json({ description });
  } catch (error) { 
      res.status(500).json({ message: "AI Error", error: error.message }); 
  }
});

// Guide Chat
app.post('/api/ai/chat', async (req, res) => {
    try {
        res.json({ reply: "Chat endpoint active" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { 
    console.log(`🚀 Socket Server running on port ${PORT}`); 
});
