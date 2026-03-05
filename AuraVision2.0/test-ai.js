const axios = require('axios');

async function testAI() {
    const baseURL = 'https://b-smart-glass-aura-vision.onrender.com';
    console.log('Testing AI against:', baseURL);

    try {
        // 1. Get a token
        const email = `ai_tester_${Date.now()}@test.com`;
        const regRes = await axios.post(`${baseURL}/api/auth/register`, {
            fullName: 'API Tester',
            email: email,
            password: 'password123',
            userType: 'VISUALLY_IMPAIRED',
            deviceId: 'TEST-123'
        }, { validateStatus: () => true });

        if (!regRes.data.token) {
            console.log('Registration failed', regRes.data);
            return;
        }
        const token = regRes.data.token;
        const userId = regRes.data.user._id;

        console.log('✅ Got Token. Testing AI Endpoint (mode: chat)...');

        // 2. Call AI API
        const aiRes = await axios.post(`${baseURL}/api/process-image`, {
            mode: 'chat',
            prompt: 'Hello! Please describe your capabilities.',
            userId: userId,
            language: 'EN'
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            validateStatus: () => true
        });

        console.log('AI response status:', aiRes.status);
        console.log('AI response body:', aiRes.data);

    } catch (err) {
        console.error('Test script error:', err.response?.data || err.message);
    }
}

testAI();
