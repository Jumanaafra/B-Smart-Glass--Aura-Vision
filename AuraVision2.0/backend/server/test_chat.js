const mongoose = require('mongoose');
const User = require('./models/User');
const History = require('./models/History');
const jwt = require('jsonwebtoken');

require('dotenv').config();

async function runTest() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // Cleanup any left over from previous runs
    await User.deleteOne({ email: 'testvi@example.com' });

    // 1. Create a dummy VI User
    const viUser = new User({
        fullName: 'Test VI User',
        email: 'testvi@example.com',
        password: 'password123',
        userType: 'VISUALLY_IMPAIRED',
        lastLocation: { lat: 13.0827, lng: 80.2707 } // Chennai
    });
    await viUser.save();
    console.log('Created VI User with ID:', viUser._id.toString());

    // 2. Create some History for this user
    await History.create([
        {
            userId: viUser._id,
            type: 'VOICE',
            content: 'What is in front of me?',
            aiResponse: 'There is a wooden chair in front of you.',
            timestamp: new Date(Date.now() - 5000)
        },
        {
            userId: viUser._id,
            type: 'VOICE',
            content: 'Read this sign.',
            aiResponse: 'The sign says "Caution: Wet Floor".',
            timestamp: new Date()
        }
    ]);
    console.log('Created History records');

    // 3. Generate a token for a Guide User (or just use the VI user's token since authenticateToken doesn't check role for this endpoint)
    const token = jwt.sign(
        { id: viUser._id.toString(), email: viUser.email, userType: 'GUIDE' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // 4. Call the /api/ai/chat endpoint
    console.log('--- Calling API ---');
    const response = await fetch('http://localhost:5000/api/ai/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            viUserId: viUser._id.toString(),
            message: 'Where is the user right now and what did they last see?'
        })
    });

    const data = await response.json();
    require('fs').writeFileSync('chat_response.json', JSON.stringify({ status: response.status, data }, null, 2));
    console.log('Saved to chat_response.json');

    // Cleanup
    await User.deleteOne({ _id: viUser._id });
    await History.deleteMany({ userId: viUser._id });
    await mongoose.disconnect();
    console.log('Cleanup done. Test finished.');
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
