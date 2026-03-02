const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
dotenv.config();

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Note: The SDK currently (0.24.x) might not have a direct listModels method on genAI
        // but we can try to find what works.

        const modelsToTry = [
            'gemini-3-flash-preview'
        ];

        for (const modelName of modelsToTry) {
            console.log(`\n--- Testing model: ${modelName} ---`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hi");
                const response = await result.response;
                console.log(`SUCCESS for ${modelName}:`, response.text().substring(0, 20));
                return; // Stop if we find one
            } catch (err) {
                console.log(`FAILED for ${modelName}:`, err.message);
            }
        }

    } catch (error) {
        console.error("General Error:", error.message);
    }
}

test();
