// backend/server/server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require("@google/generative-ai"); 
const http = require('http'); 
const { Server } = require("socket.io"); 

// 🔥 Face API Imports (Python தேவையில்லை, இதுவே பாத்துக்கும்!)
const { Canvas, Image, ImageData } = require('canvas');
const faceapi = require('@vladmandic/face-api');

// Models
const User = require('./models/User');
const Face = require('./models/Face');
const History = require('./models/History');

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

// --- GEMINI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// ✅ SELECTED MODEL: gemini-2.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- 🔥 LOAD FACE API MODELS 🔥 ---
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
async function loadFaceModels() {
  try {
    // Note: Create a 'weights' folder in your server directory and put the model files there
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./weights');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./weights');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./weights');
    console.log("✅ Face-API Models Loaded Successfully!");
  } catch (err) {
    console.error("⚠️ Face-API Models missing. Create a '/weights' folder and add model files.");
  }
}
loadFaceModels();

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('send-video-frame', (data) => {
    socket.broadcast.emit('receive-video-frame', data);
  });

  socket.on('send-location', (data) => {
    socket.broadcast.emit('receive-location', data);
    
    if (data.deviceId) {
        User.findOneAndUpdate(
            { deviceId: data.deviceId },
            { $set: { lastLocation: { lat: data.lat, lng: data.lng } } }
        ).catch(err => console.error("Loc Update Error", err));
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// --- ROUTES ---

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

// 4. FACES: Add New Person (Generates Descriptor natively via face-api.js)
app.post('/api/faces/add', async (req, res) => { 
    try {
        const { userId, name, imageUrl } = req.body;
        
        console.log("Generating face encoding for:", name);

        // Convert Base64 to Image Object directly
        const img = new Image();
        img.src = imageUrl.startsWith('data:') ? imageUrl : `data:image/jpeg;base64,${imageUrl}`;
        
        // Detect Face
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            return res.status(400).json({ message: "Could not detect face. Try a clearer photo." });
        }

        const descriptor = Array.from(detection.descriptor); // Convert to normal array for MongoDB

        // Save to DB
        const newFace = new Face({ 
            userId, name, imageUrl, descriptor 
        });
        await newFace.save();

        res.status(201).json({ message: "Person added successfully", face: newFace });

    } catch(e) { 
        console.error("Add Face Error:", e);
        res.status(500).json({error: e.message});
    }
});

// 5. FACES: Get All People
app.get('/api/faces/:userId', async (req, res) => { 
    try {
        const faces = await Face.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(faces);
    } catch(e) { res.status(500).json({error: e.message}) }
});

// 6. MAIN AI ROUTE: Process Image (Face Rec + Gemini 2.5 Flash)
app.post('/api/process-image', async (req, res) => {
  try {
    const { imageBase64, prompt, userId, language } = req.body; 

    // A. Fetch Known Faces from DB
    let faces = [];
    if(userId && userId.length === 24) {
        faces = await Face.find({ userId: userId }).select('name descriptor');
    }
    
    // B. Run Face Recognition Directly using Face-API
    console.log("🔍 Analyzing image...");
    let faceResult = { match: "Unknown" };
    
    try {
        const img = new Image();
        img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        
        if (detection && faces.length > 0) {
            // Filter only faces that have valid saved descriptors
            const validFaces = faces.filter(f => f.descriptor && f.descriptor.length === 128);
            
            if (validFaces.length > 0) {
                const labeledDescriptors = validFaces.map(f => new faceapi.LabeledFaceDescriptors(f.name, [new Float32Array(f.descriptor)]));
                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6); // 0.6 is strictness
                const match = faceMatcher.findBestMatch(detection.descriptor);
                
                if (match.label !== 'unknown') {
                    faceResult.match = match.label;
                }
            }
        }
    } catch (e) {
        console.log("⚠️ Face Rec skipped, proceeding to Gemini. Error:", e.message);
    }

    let finalResponse = "";

    // CASE 1: Face Found (Known Person)
    if (faceResult.match !== "Unknown") {
        if (language === 'TG') {
             finalResponse = `Idhu unga ${faceResult.match}.`;
        } else {
             finalResponse = `This is your ${faceResult.match}.`;
        }
        console.log("✅ Face Match:", finalResponse);
    
    } else {
        // CASE 2: Ask Gemini 2.5 Flash (Unknown or No Face)
        console.log("🤖 Asking Gemini 2.5 Flash...");
        
        const systemPrompt = language === 'TG' 
            ? "You are a vision assistant guiding a blind person. Reply in 'Tanglish' (Tamil words in English letters). Keep it short."
            : "You are a vision assistant guiding a blind person. Reply in simple English. Keep it short and helpful.";

        const chatModel = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt 
        });

        const imagePart = {
            inlineData: {
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
                mimeType: "image/jpeg",
            },
        };

        const result = await chatModel.generateContent([prompt || "Describe this scene.", imagePart]);
        const response = await result.response;
        finalResponse = response.text();
    }

    // C. Save History
    if (userId && userId.length === 24) {
        await new History({
            userId, 
            type: 'VOICE', 
            content: prompt || "Visual Query", 
            aiResponse: finalResponse
        }).save();
    }

    console.log("📤 Sending Response:", finalResponse);
    res.json({ description: finalResponse });

  } catch (error) {
    console.error("❌ Processing Error:", error.message);
    res.status(500).json({ message: "Processing Error", error: error.message });
  }
});

// 7. AI: Chat (Guide) - Text Only
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await chatModel.generateContent(message);
    const response = await result.response;
    res.json({ reply: response.text() });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ message: "AI Error", error: error.message });
  }
});

// 8. HISTORY: Get User History
app.get('/api/history/:userId', async (req, res) => {
    try {
        const history = await History.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(15);
        res.json(history);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
