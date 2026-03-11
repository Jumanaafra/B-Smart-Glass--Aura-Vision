import fetch from 'node-fetch';

async function test() {
  // 1. Login as VI Test user to get Token
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test_vi@auravision.com', password: 'test1234', userType: 'VI' })
  });
  
  const loginData = await loginRes.json();
  if(!loginData.token) {
    console.log("VI LOGIN FAILED", loginData);
    return;
  }
  
  const token = loginData.token;
  const userId = loginData.user._id;
  
  console.log("Logged in as VI. User ID:", userId);
  
  // 2. Fetch history
  const historyRes = await fetch(`http://localhost:5000/api/history/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const historyData = await historyRes.json();
  console.log("History retrieved:", historyData.length, "items.");
  if(historyData.length > 0) {
    console.log(historyData[0]);
  }
}

test().catch(console.error);
