import fetch from 'node-fetch';

const BASE = 'http://localhost:5000';

async function run() {
  // 1. Login as Guide
  console.log('\n--- Step 1: Guide Login ---');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test_guide@auravision.com', password: 'test1234', userType: 'GUIDE' })
  });
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status, loginData.message || '');
  if (!loginData.token) { console.error('LOGIN FAILED:', loginData); return; }
  const token = loginData.token;
  console.log('deviceId in token:', JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).deviceId);

  // 2. Get Connected VI
  console.log('\n--- Step 2: GET /api/user/connected-vi ---');
  const viRes = await fetch(`${BASE}/api/user/connected-vi`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const viData = await viRes.json();
  console.log('Status:', viRes.status);
  if (!viRes.ok) { console.error('FAILED:', viData); return; }
  const viId = viData._id;
  console.log('VI User:', viData.email, '| Last Location:', viData.lastLocation);

  // 3. Get History for VI user
  console.log('\n--- Step 3: GET /api/history/<viId> ---');
  const histRes = await fetch(`${BASE}/api/history/${viId}?page=1&limit=10`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const histData = await histRes.json();
  console.log('Status:', histRes.status);
  console.log('History count:', Array.isArray(histData) ? histData.length : 'Not an array:' + JSON.stringify(histData));
  if (Array.isArray(histData) && histData.length > 0) {
    console.log('Latest entry:', histData[0]);
  }

  // 4. Get VI Profile from Guide token
  console.log('\n--- Step 4: GET /api/user/<viId> from Guide ---');
  const profRes = await fetch(`${BASE}/api/user/${viId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profData = await profRes.json();
  console.log('Status:', profRes.status, '| lastLocation:', profData.lastLocation);
}

run().catch(console.error);
