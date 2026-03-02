global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;
global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

try {
    // Mock canvas globally
    const canvas = require('canvas');
    const tf = require('@tensorflow/tfjs'); // use pure JS

    // Need to trick face-api into NOT requiring tfjs-node
    // We can try to manually load the face-api web version
    const faceapi = require('@vladmandic/face-api/dist/face-api.js');

    faceapi.env.monkeyPatch({ Canvas: canvas.Canvas, Image: canvas.Image, ImageData: canvas.ImageData });

    console.log("FACE API LOADED:", !!faceapi);
} catch (e) {
    console.error("FACE API FAILED:", e.message);
    console.error(e.stack);
}
