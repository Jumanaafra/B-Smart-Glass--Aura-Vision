const axios = require('axios');

async function testAuth() {
    const baseURL = 'https://b-smart-glass-aura-vision.onrender.com';
    console.log('Testing:', baseURL);

    try {
        // 1. Try to hit a protected route without auth to confirm it blocks
        console.log('\n--- 1. Testing protected route (Expecting 401) ---');
        try {
            await axios.get(`${baseURL}/api/auth/me`);
        } catch (e) {
            console.log('Result:', e.response?.status, e.response?.data);
        }

        // 2. We need a test user to login and get a cookie.
        // Assuming there's a test user or we just try a dummy login to see the cookie structure
        console.log('\n--- 2. Testing Login ---');
        const loginRes = await axios.post(`${baseURL}/api/auth/login`, {
            email: 'test@example.com', // Replace if you know a real one
            password: 'password123'
        }, {
            validateStatus: () => true
        });

        console.log('Login Status:', loginRes.status);
        console.log('Login Body:', loginRes.data);

        const cookies = loginRes.headers['set-cookie'];
        console.log('Set-Cookie Header:', cookies);

        if (!cookies) {
            console.log('❌ NO COOKIES RETURNED FROM LOGIN');
            return;
        }

        const tokenCookie = cookies.find(c => c.startsWith('token='));
        const token = tokenCookie ? tokenCookie.split('token=')[1].split(';')[0] : null;

        if (token) {
            console.log('\n--- 3. Testing protected route WITH token ---');
            const protectedRes = await axios.get(`${baseURL}/api/auth/me`, {
                headers: {
                    Cookie: `token=${token}`
                }
            });
            console.log('Protected Route Status:', protectedRes.status);
            console.log('Protected Route Data:', protectedRes.data);
        }

    } catch (error) {
        console.error('Script Error:', error.message);
    }
}

testAuth();
