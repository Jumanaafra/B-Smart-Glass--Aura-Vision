const axios = require('axios');
async function test() {
    try {
        const email = `test_${Date.now()}@example.com`;
        const res = await axios.post('https://b-smart-glass-aura-vision.onrender.com/api/auth/register', {
            fullName: 'Test User',
            email: email,
            password: 'password123',
            userType: 'VISUALLY_IMPAIRED'
        });
        console.log('Reg status:', res.status);
        console.log('Set-Cookie:', res.headers['set-cookie']);
    } catch (e) {
        console.log('Error:', e.response?.data);
    }
}
test();
