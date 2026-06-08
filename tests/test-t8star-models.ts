import dotenv from 'dotenv';
import path from 'path';
import { T8StarProvider } from '../server/src/services/ai/providers/t8star';

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TEXT_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite-preview-thinking-medium',
    'gemini-3.1-flash-lite-preview-thinking-minimal',
    'gemini-3.1-flash-lite-preview-thinking-low',
    'gemini-3.1-flash-lite-preview-thinking-high',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview-customtools',
    'gemini-3.1-pro-preview-thinking-high',
    'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-thinking-medium',
    'gemini-3.1-pro-preview-thinking-low'
];

const IMAGE_MODELS = [
    'gemini-3.1-flash-image-preview-2k',
    'gemini-3.1-flash-image-preview-512px',
    'gemini-3.1-flash-image-preview-4k',
    'gemini-3.1-flash-image-preview',
    'gpt-image-2',
    'nano-banana-pro'
];

interface TestResult {
    model: string;
    type: 'text' | 'image';
    status: 'SUCCESS' | 'FAILED';
    latencyMs: number;
    response?: string;
    error?: string;
}

async function runTests() {
    console.log('==================================================');
    console.log('       T8STAR MODEL CONNECTIVITY TEST SCRIPT       ');
    console.log('==================================================');
    console.log('T8_BASE_URL:', process.env.T8_BASE_URL);
    console.log('T8_MEDIA_BASE_URL:', process.env.T8_MEDIA_BASE_URL);
    console.log('T8_TEXT_API_KEY prefix:', process.env.T8_TEXT_API_KEY ? `${process.env.T8_TEXT_API_KEY.slice(0, 8)}...` : 'NONE');
    console.log('T8_IMAGE_API_KEY prefix:', process.env.T8_IMAGE_API_KEY ? `${process.env.T8_IMAGE_API_KEY.slice(0, 8)}...` : 'NONE');
    console.log('==================================================\n');

    const provider = new T8StarProvider({
        baseUrl: process.env.T8_BASE_URL || "https://ai.t8star.org",
        mediaBaseUrl: process.env.T8_MEDIA_BASE_URL || "https://ai.t8star.org",
        apiKey: process.env.T8_TEXT_API_KEY || "",
        mediaApiKey: process.env.T8_IMAGE_API_KEY || "",
        videoApiKey: process.env.T8_VIDEO_API_KEY || "",
        audioApiKey: process.env.T8_AUDIO_API_KEY || "",
    });

    const results: TestResult[] = [];

    // 1. Test Text Models
    console.log('--- Phase 1: Testing Text/Reasoning Models ---');
    for (const model of TEXT_MODELS) {
        console.log(`Testing text model: ${model}...`);
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per model

        try {
            const res = await provider.generateContent({
                model,
                contents: "Say 'Hello' and then explain what 2+2 is in under 10 words.",
                config: {
                    signal: controller.signal,
                    temperature: 0.1
                }
            });
            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;
            const textResponse = res.text || '';
            console.log(`  [SUCCESS] Latency: ${latency}ms | Response: "${textResponse.trim()}"`);
            results.push({
                model,
                type: 'text',
                status: 'SUCCESS',
                latencyMs: latency,
                response: textResponse.trim()
            });
        } catch (e: any) {
            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;
            let errMsg = e?.message || String(e);
            if (e?.name === 'AbortError') {
                errMsg = 'Timeout (20 seconds reached)';
            }
            console.error(`  [FAILED] Latency: ${latency}ms | Error: ${errMsg}`);
            results.push({
                model,
                type: 'text',
                status: 'FAILED',
                latencyMs: latency,
                error: errMsg
            });
        }
    }

    // 2. Test Image Models
    console.log('\n--- Phase 2: Testing Image Generation Models ---');
    for (const model of IMAGE_MODELS) {
        console.log(`Testing image model: ${model}...`);
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout for image gen

        try {
            const res = await provider.generateContent({
                model,
                contents: "A red apple",
                config: {
                    signal: controller.signal,
                    imageConfig: {
                        aspectRatio: '1:1',
                        overrideNanoSize: '512px'
                    }
                }
            });
            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;
            const responseText = res.text || '';
            // If response includes data or uri
            let desc = '';
            if (res.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                const mime = res.candidates[0].content.parts[0].inlineData.mimeType;
                const dataLen = res.candidates[0].content.parts[0].inlineData.data?.length || 0;
                desc = `Returned inline data (${mime}), size: ${dataLen} chars`;
            } else {
                desc = responseText.trim();
            }
            console.log(`  [SUCCESS] Latency: ${latency}ms | Response: ${desc}`);
            results.push({
                model,
                type: 'image',
                status: 'SUCCESS',
                latencyMs: latency,
                response: desc
            });
        } catch (e: any) {
            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;
            let errMsg = e?.message || String(e);
            if (e?.name === 'AbortError') {
                errMsg = 'Timeout (35 seconds reached)';
            }
            console.error(`  [FAILED] Latency: ${latency}ms | Error: ${errMsg}`);
            results.push({
                model,
                type: 'image',
                status: 'FAILED',
                latencyMs: latency,
                error: errMsg
            });
        }
    }

    // 3. Print Summary Table
    console.log('\n==================================================');
    console.log('                  SUMMARY TABLE                   ');
    console.log('==================================================');
    console.log(
        `${'Model Name'.padEnd(45)} | ${'Type'.padEnd(5)} | ${'Status'.padEnd(7)} | ${'Latency'.padEnd(8)} | ${'Details / Error'}`
    );
    console.log('-'.repeat(120));

    for (const r of results) {
        const latencyStr = `${r.latencyMs}ms`;
        const detailStr = r.status === 'SUCCESS' 
            ? (r.response ? (r.response.length > 50 ? r.response.slice(0, 47) + '...' : r.response) : 'N/A')
            : (r.error ? (r.error.length > 50 ? r.error.slice(0, 47) + '...' : r.error) : 'Unknown error');

        console.log(
            `${r.model.padEnd(45)} | ${r.type.padEnd(5)} | ${r.status.padEnd(7)} | ${latencyStr.padEnd(8)} | ${detailStr}`
        );
    }
    console.log('==================================================\n');
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
});
