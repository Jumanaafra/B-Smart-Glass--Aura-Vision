const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        console.log("Fetching models...");
        const response = await axios.get(url);
        console.log("Success! Available models:");
        response.data.models.forEach(m => {
            console.log(`- ${m.name} (${m.displayName})`);
        });
    } catch (error) {
        console.error("Error fetching models:", error.response ? error.response.status : error.message);
        if (error.response && error.response.data) {
            console.error("Error details:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

listModels();
