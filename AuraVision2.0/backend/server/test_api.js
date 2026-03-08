const mongoose = require('mongoose');
const User = require('./models/User');
const History = require('./models/History');
const jwt = require('jsonwebtoken');

require('dotenv').config();

async function runApiIntegrationTest() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to DB');

    // CLEANUP from older tests
    await User.deleteMany({ email: { $in: ['guide_test@example.com', 'vi_test@example.com'] } });

    // 1. Create a VI User
    const viUser = new User({
        fullName: 'David (VI)',
        email: 'vi_test@example.com',
        password: 'password123',
        userType: 'VISUALLY_IMPAIRED',
        lastLocation: { lat: 40.7128, lng: -74.0060 } // New York
    });
    await viUser.save();
    console.log(`✅ Created VI User: ${viUser.fullName} (${viUser._id.toString()})`);

    // 2. Add some specific context interactions for this VI User
    await History.create([
        {
            userId: viUser._id,
            type: 'VOICE',
            content: 'Is there a crosswalk here?',
            aiResponse: 'Yes, there is a crosswalk right in front of you with a pedestrian signal.',
            timestamp: new Date(Date.now() - 10000)
        },
        {
            userId: viUser._id,
            type: 'LOCATION',
            location: { lat: 40.7128, lng: -74.0060, address: 'Times Square, NY' },
            timestamp: new Date()
        }
    ]);
    console.log('✅ Injected history/location logs for VI user.');

    // 3. Create a Guide User
    const guideUser = new User({
        fullName: 'Sarah (Guide)',
        email: 'guide_test@example.com',
        password: 'password123',
        userType: 'GUIDE'
    });
    await guideUser.save();
    console.log(`✅ Created Guide User: ${guideUser.fullName}`);

    // 4. Generate token for Guide
    const guideToken = jwt.sign(
        { id: guideUser._id.toString(), email: guideUser.email, userType: 'GUIDE' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    console.log('\n🚀 Executing POST /api/ai/chat as the Guide user...');

    // 5. Test the API Endpoints as the Guide specifying the VI user
    const response = await fetch('http://localhost:5000/api/ai/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${guideToken}`
        },
        body: JSON.stringify({
            viUserId: viUser._id.toString(), // Guide provides VI user ID
            message: 'Can you tell me where David is right now and what he asked you last?'
        })
    });

    const responseData = await response.json();
    console.log('\n--- 🟢 API RESPONSE FROM SERVER ---');
    console.log('Status Code:', response.status);
    console.log('Response Body:', JSON.stringify(responseData, null, 2));
    console.log('---------------------------------');

    // CLEANUP AFTER TEST
    await User.deleteMany({ _id: { $in: [viUser._id, guideUser._id] } });
    await History.deleteMany({ userId: viUser._id });

    await mongoose.disconnect();
    console.log('\n✅ Cleanup complete. Test Finished successfully.');
}

runApiIntegrationTest().catch(console.error);
