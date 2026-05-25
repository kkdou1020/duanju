import { GoogleProvider } from '../server/src/services/ai/providers/google';
import dotenv from 'dotenv';
dotenv.config();

async function testGoogle() {
    console.log('Testing Google Provider...');
    const provider = new GoogleProvider();
    try {
        const response = await provider.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: {
                parts: [{ text: "Translate 'hello world' to French and Spanish. Provide the answer in JSON format." }]
            },
            config: {
                responseMimeType: "application/json"
            }
        });
        
        console.log('--- RESPONSE: ---');
        console.log(response.text);
        console.log({ candidates: response.candidates });
        console.log('--- DONE ---');
    } catch (e) {
        console.error('FAILED!', e);
    }
}

testGoogle();
