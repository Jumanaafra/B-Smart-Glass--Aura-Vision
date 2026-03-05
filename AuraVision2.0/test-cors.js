async function test() {
    const url = 'https://b-smart-glass-aura-vision.onrender.com/api/process-image';
    const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
            'Origin': 'https://copy-of-copy-of-copy-of-aura-vision.vercel.app',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
        }
    });
    console.log('Status:', res.status);
    res.headers.forEach((v, k) => console.log(k, ':', v));
}
test();
