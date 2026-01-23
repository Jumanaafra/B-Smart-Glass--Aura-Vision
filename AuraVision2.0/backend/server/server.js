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
const History = require('./models/History'); // புது மாடல் சேர்ப்பு

dotenv.config();
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('send-video-frame', (data) => {
    socket.broadcast.emit('receive-video-frame', data);
  });

  socket.on('send-location', async (data) => {
    socket.broadcast.emit('receive-location', data);

    if (data.deviceId) {
      try {
        // 1. Update Last Location in User Model
        const user = await User.findOneAndUpdate(
          { deviceId: data.deviceId, userType: 'VISUALLY_IMPAIRED' },
          { $set: { lastLocation: { lat: data.lat, lng: data.lng } } },
          { new: true } // Return updated doc
        );

        // 2. (Optional) Save Location History occasionally?
        // ஒவ்வொரு முறையும் சேவ் பண்ணா DB நிறையும். 
        // முக்கியமா 'User Query' கேட்கும் போது லொகேஷனை சேவ் பண்ணலாம் (கீழே பார்க்கவும்).
      } catch (err) {
        console.error("Error saving location:", err);
      }
    }
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

// --- ROUTES ---

// GET History (Pagination: 15 items)
app.get('/api/history/:userId', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        const history = await History.find({ userId: req.params.userId })
            .sort({ timestamp: -1 }) // புதுசு மேல வரணும்
            .skip(skip)
            .limit(limit);
        
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add Face
app.post('/api/faces/add', async (req, res) => { 
    try {
        const { userId, name, imageUrl } = req.body;
        const newFace = new Face({ userId, name, imageUrl });
        await newFace.save();
        res.status(201).json({ message: "Person added", face: newFace });
    } catch(e) { res.status(500).json({error: e.message}) }
});

// Get Faces
app.get('/api/faces/:userId', async (req, res) => { 
    try {
        const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(faces);
    } catch(e) { res.status(500).json({error: e.message}) }
});

// Get User Profile (Last Location)
app.get('/api/user/:id', async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) { res.status(500).json({ message: "Error" }); }
});

// Get Location by Device ID
app.get('/api/location/:deviceId', async (req, res) => {
    try {
      const user = await User.findOne({ deviceId: req.params.deviceId, userType: 'VISUALLY_IMPAIRED' });
      if (user && user.lastLocation) res.json(user.lastLocation);
      else res.json({ lat: 13.0827, lng: 80.2707 }); 
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => { /* Same as before */ 
    try {
        const { fullName, email, password, userType, deviceId } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists" });
        const newUser = new User({ fullName, email, password, userType, deviceId });
        await newUser.save();
        res.status(201).json({ message: "User registered", user: newUser });
    } catch (error) { res.status(500).json({ message: "Server Error", error: error.message }); }
});

app.post('/api/auth/login', async (req, res) => { /* Same as before */
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.password !== password) return res.status(400).json({ message: "Invalid credentials" });
        res.json({ message: "Login successful", user });
    } catch (error) { res.status(500).json({ message: "Server Error", error: error.message }); }
});

app.put('/api/user/:id/settings', async (req, res) => { /* Same as before */
    try {
        const { settings } = req.body; 
        const user = await User.findByIdAndUpdate(req.params.id, { $set: { settings: settings } }, { new: true });
        res.json({ message: "Settings updated", user });
    } catch (error) { res.status(500).json({ message: "Error updating settings" }); }
});

// AI Describe (Updated to Save History)
// server.js - api/ai/describe route குள்ள
// server.js - api/ai/describe route kullara idha podu

app.post('/api/ai/describe', async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body;

    const imageContent = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    // 🔥 BLIND ASSISTANT SYSTEM PROMPT 🔥
    const systemInstruction = `
      You are Aura, an intelligent visual assistant guiding a blind person in a public environment. 
      Your mission is to act as their eyes, ensuring safety and independence.

      STRICT RULES:
      1. **LANGUAGE MIRRORING (Crucial):** - Listen to the user's prompt language carefully.
         - If user speaks **English**, reply in **English**.
         - If user speaks **Tamil**, reply in **Tamil** (Tamil Script).
         - If user speaks **Tanglish** (Tamil words in English text), reply in **Tanglish**.
         - If user speaks **Hindi**, reply in **Hindi**.
      
      2. **SAFETY FIRST:** - Immediately warn about hazards: Traffic, Potholes, Stairs, Low hanging branches, Poles, or Crowds.
         - Use "Stop" or "Caution" if immediate danger is detected.

      3. **NAVIGATION STYLE:** - Be specific about location using clock positions (e.g., "Table at 12 o'clock", "Car approaching from 3 o'clock").
         - Estimate distance (e.g., "2 steps ahead").

      4. **BE CONCISE:** - Keep response under 2 sentences. Audio latency matters. No robotic greetings.
      
      Example Scenarios:
      - User (Tanglish): "Munnadi enna irukku?" -> You (Tanglish): "Munnadi oru bike park panni irukku, 2 adi thalli nadanga."
      - User (English): "Is it safe to cross?" -> You (English): "No, there is a moving car approaching from the left. Wait."
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast & Cost-effective
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: [ 
            { type: "text", text: prompt || "Describe the scene for navigation." }, 
            { type: "image_url", image_url: { url: imageContent } } 
        ] },
      ],
      max_tokens: 150, // Short response
    });

    const description = response.choices[0].message.content;
    // --- SAVE HISTORY ---
    if (userId) {
        const newHistory = new History({
            userId: userId,
            type: 'VOICE',
            content: prompt || "Visual Query", // User கேட்ட கேள்வி
            location: { lat: lat || 0, lng: lng || 0 } // கேள்வி கேட்ட இடம்
        });
        await newHistory.save();
    }

    res.json({ description });
  } catch (error) { 
      console.error(error);
      res.status(500).json({ message: "AI Error", error: error.message }); 
  }
});

// Guide Chat (Updated)
app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message } = req.body;
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      });
      res.json({ reply: response.choices[0].message.content });
    } catch (error) { res.status(500).json({ message: "AI Error", error: error.message }); }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Socket Server running on http://localhost:${PORT}`);
});

