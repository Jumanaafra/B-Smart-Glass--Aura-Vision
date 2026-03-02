// backend/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const http = require('http'); 
const { Server } = require("socket.io"); 

// 🔥 Face API Imports 🔥
const { Canvas, Image, ImageData } = require('canvas');


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

// 🔥 Patch Face-API and Load Models 🔥
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
async function loadFaceModels() {
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./weights');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./weights');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./weights');
    console.log("✅ Face-API Models Loaded!");
  } catch (err) {
    console.error("⚠️ Face-API Weights not found. Create a 'weights' folder and add model files.");
  }
}
loadFaceModels();

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('send-video-frame', (data) => socket.broadcast.emit('receive-video-frame', data));
  socket.on('send-location', async (data) => {
    socket.broadcast.emit('receive-location', data);
    if (data.deviceId) {
      try {
        await User.findOneAndUpdate(
          { deviceId: data.deviceId, userType: 'VISUALLY_IMPAIRED' },
          { $set: { lastLocation: { lat: data.lat, lng: data.lng } } },
          { new: true } 
        );
      } catch (err) {}
    }
  });
  socket.on('disconnect', () => console.log('User disconnected'));
});

// --- ROUTES ---

// GET History
app.get('/api/history/:userId', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const history = await History.find({ userId: req.params.userId }).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit);
        res.json(history);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🔥 UPDATE: Add Face with Descriptor Logic 🔥
app.post('/api/faces/add', async (req, res) => { 
    try {
        const { userId, name, imageUrl, base64Image } = req.body;
        
        // Convert Base64 from app to Image object
        const img = new Image();
        img.src = base64Image; // Mobile app-ல் இருந்து போட்டோவை base64 ஆக அனுப்ப வேண்டும்
        
        // Detect face and extract descriptor
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        
        if (!detection) {
            return res.status(400).json({ message: "No face detected in the image." });
        }

        const descriptor = Array.from(detection.descriptor); // Convert Float32Array to normal Array

        const newFace = new Face({ userId, name, imageUrl, descriptor });
        await newFace.save();
        res.status(201).json({ message: "Person added successfully", face: newFace });
    } catch(e) { res.status(500).json({error: e.message}) }
});

// Get Faces
app.get('/api/faces/:userId', async (req, res) => { 
    try {
        const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(faces);
    } catch(e) { res.status(500).json({error: e.message}) }
});

// Profile & Location
app.get('/api/user/:id', async (req, res) => { /* Same as before */ });
app.get('/api/location/:deviceId', async (req, res) => { /* Same as before */ });
app.post('/api/auth/register', async (req, res) => { /* Same as before */ });
app.post('/api/auth/login', async (req, res) => { /* Same as before */ });
app.put('/api/user/:id/settings', async (req, res) => { /* Same as before */ });

// 🔥 UPDATE: AI Describe with Face Recognition 🔥
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
        
        // FACE DETECTION LOGIC
        if (mode === 'face' && userId) {
            try {
                const img = new Image();
                img.src = imageContent;
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

                if (detection) {
                    const savedFaces = await Face.find({ userId: userId });
                    if (savedFaces.length > 0) {
                        const labeledDescriptors = savedFaces.map(f => new faceapi.LabeledFaceDescriptors(f.name, [new Float32Array(f.descriptor)]));
                        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
                        const match = faceMatcher.findBestMatch(detection.descriptor);
                        
                        if (match.label !== 'unknown') {
                            finalPrompt = `The person in the image is your known contact named '${match.label}'. Tell the user that ${match.label} is in front of them and describe their expression. Reply in the user's language. User query: ${prompt}`;
                        }
                    }
                }
            } catch (err) { console.error("Face API Match Error:", err); }
        }

        userMessageContent = [ 
            { type: "text", text: finalPrompt }, 
            { type: "image_url", image_url: { url: imageContent } } 
        ];
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userMessageContent }],
      max_tokens: 150, 
    });

    const description = response.choices[0].message.content;

    if (userId) {
        await new History({ userId, type: 'VOICE', content: prompt || "Visual Query", location: { lat: lat || 0, lng: lng || 0 } }).save();
    }

    res.json({ description });
  } catch (error) { 
      res.status(500).json({ message: "AI Error", error: error.message }); 
  }
});

// Guide Chat
app.post('/api/ai/chat', async (req, res) => { /* Same as before */ });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { console.log(`🚀 Socket Server running on http://localhost:${PORT}`); });

