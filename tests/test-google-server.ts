import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(__dirname, '../.env') });

import { GoogleProvider } from '../server/src/services/ai/providers/google';

async function test() {
    try {
        console.log("Initializing Google Provider...");
        const provider = new GoogleProvider();
        
        console.log("Sending test text generation request...");
        const response = await provider.generateContent({
            model: 'gemini-3.1-flash-lite-preview-thinking-high',
            contents: "Test query: What is the weather like in Tokyo right now? Provide a brief answer.",
            config: { systemInstruction: "You are a helpful assistant." }
        });
        
        console.log("Success! Received response:");
        console.log(response);
    } catch (e) {
        console.error("Failed to connect to Google API:", e);
    }
}

test();
