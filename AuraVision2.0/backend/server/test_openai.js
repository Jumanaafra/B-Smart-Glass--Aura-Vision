const OpenAI = require('openai');
const dotenv = require('dotenv');
dotenv.config();

console.log("Checking API Key format...");
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_openai')) {
    console.error("❌ Invalid or missing OPENAI_API_KEY in .env");
    process.exit(1);
}
console.log(`Key found (starts with ${apiKey.substring(0, 5)}...)`);

const openai = new OpenAI({ apiKey: apiKey });

async function testOpenAI() {
    try {
        console.log("Connecting to OpenAI (sending a test ping)...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Reply with precisely the word: Connected" }],
            max_tokens: 10
        });

        console.log("✅ SUCCESS!");
        console.log("🤖 ChatGPT replied:", completion.choices[0].message.content);
    } catch (error) {
        console.error("❌ ERROR FAILED TO CONNECT!");
        console.error("Message:", error.message);
        if (error.status === 401) {
            console.error("💡 Hint: Your API key is invalid or incorrect.");
        } else if (error.status === 429) {
            console.error("💡 Hint: You have hit a rate limit or exhausted your quota/billing.");
        }
    }
}

testOpenAI();
