const canvas = require('canvas');
const faceapi = require('@vladmandic/face-api');
faceapi.env.monkeyPatch({ Canvas: canvas.Canvas, Image: canvas.Image, ImageData: canvas.ImageData });

async function loadAndTest() {
    try {
        console.log("Loading models...");
        await faceapi.nets.ssdMobilenetv1.loadFromDisk('./weights');
        await faceapi.nets.faceLandmark68Net.loadFromDisk('./weights');
        await faceapi.nets.faceRecognitionNet.loadFromDisk('./weights');
        console.log("Models loaded!");

        console.log("Testing detection on a dummy canvas...");
        const c = canvas.createCanvas(200, 200);
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 200, 200);

        // We expect this to execute and return empty array or undefined without crashing
        const detection = await faceapi.detectSingleFace(c).withFaceLandmarks().withFaceDescriptor();
        console.log("Detection raw result:", !!detection ? "Found face" : "No face (expected on blank red square)");
        console.log("SUCCESS! Face-API is fully working!");
    } catch (err) {
        console.error("FAIL:", err.message);
    }
}
loadAndTest();
