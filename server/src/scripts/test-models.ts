import dotenv from 'dotenv';
import path from 'path';

// Load environment variables (matching Express server startup)
if (process.env.EXTERNAL_ENV_PATH) {
    const extPath = path.join(process.env.EXTERNAL_ENV_PATH, '.env');
    console.log(`[Test] Loading external env from: ${extPath}`);
    dotenv.config({ path: extPath, override: true });
}
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

import { getModelManager } from '../services/ai/model-manager';

async function testConnection() {
    console.log("=========================================");
    console.log("     AI Model Connection Test Script     ");
    console.log("=========================================");

    const mm = getModelManager();
    const config = mm.getConfig();

    console.log("\n[1] Current Configuration Overview:");
    console.log(`- Active Text Channel (LLM): ${config.textmodel}`);
    console.log(`- Active Image Channel: ${config.imagemodel}`);
    console.log(`- Active Video Channel: ${config.videomodel}`);
    console.log(`- Text Model Name: ${config.t8starTextModel}`);
    console.log(`- Image Model Name: ${config.t8starImageModel}`);
    console.log(`- Video Model Name: ${config.t8starVideoModel}`);

    const providers = config.providers || [];
    console.log(`- Total Providers Registered: ${providers.length}`);
    providers.forEach(p => {
        console.log(`  * [${p.id}] ${p.name} - Enabled: ${p.enabled}, Base URL: ${p.baseUrl}`);
        console.log(`    - Global Key: ${p.apiKey ? p.apiKey.substring(0, 8) + "..." : "NONE"}`);
        if (p.modelApiKeys && Object.keys(p.modelApiKeys).length > 0) {
            console.log(`    - Model Keys:`);
            Object.entries(p.modelApiKeys).forEach(([m, k]) => {
                console.log(`      * ${m}: ${k ? k.substring(0, 8) + "..." : "NONE"}`);
            });
        }
    });

    console.log("\n[2] Testing Active Global Models (ModelManager)...");

    // 1. Test Active LLM / Text Model
    if (config.t8starTextModel) {
        console.log(`\n--> Testing Text Model [${config.t8starTextModel}] via [${config.textmodel}]...`);
        try {
            const start = Date.now();
            const res = await mm.generateContent({
                model: config.t8starTextModel,
                contents: "Hello! Reply with exactly the word 'ONLINE' to confirm connection.",
                config: { max_tokens: 10, temperature: 0.1 }
            });
            const duration = Date.now() - start;
            console.log(`✅ Success! (took ${duration}ms)`);
            console.log(`   Response: "${res.text?.trim()}"`);
        } catch (e: any) {
            console.error(`❌ Failed!`);
            console.error(`   Error: ${e?.message || e}`);
        }
    } else {
        console.log("⚠️ No active text model configured.");
    }

    // 2. Test Active Image Model
    if (config.t8starImageModel) {
        console.log(`\n--> Testing Image Model [${config.t8starImageModel}] via [${config.imagemodel}]...`);
        try {
            const start = Date.now();
            // Call generateContent with config.imageConfig to trigger image generation flow
            const res = await mm.generateContent({
                model: config.t8starImageModel,
                contents: "A simple red apple.",
                config: {
                    imageConfig: {
                        aspectRatio: "1:1",
                        overrideNanoSize: "1K"
                    }
                }
            });
            const duration = Date.now() - start;
            const hasData = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            const hasUrl = res.text?.includes('![');
            if (hasData || hasUrl) {
                console.log(`✅ Success! (took ${duration}ms)`);
                console.log(`   Result Type: ${hasData ? "Base64 Image Data" : "Image URL Link"}`);
                if (hasUrl) console.log(`   URL: ${res.text}`);
            } else {
                console.log(`⚠️ Success but no image payload found! (took ${duration}ms)`);
                console.log(`   Response:`, JSON.stringify(res).substring(0, 200));
            }
        } catch (e: any) {
            console.error(`❌ Failed!`);
            console.error(`   Error: ${e?.message || e}`);
        }
    } else {
        console.log("⚠️ No active image model configured.");
    }

    // 3. Test Active Video Model
    if (config.t8starVideoModel) {
        console.log(`\n--> Testing Video Model [${config.t8starVideoModel}] via [${config.videomodel}]...`);
        try {
            const start = Date.now();
            const res = await mm.generateVideos({
                model: config.t8starVideoModel,
                prompt: "A beautiful garden waterfall, slow motion.",
                config: {
                    seconds: 8,
                    aspectRatio: "16:9"
                }
            });
            const duration = Date.now() - start;
            console.log(`✅ Success! Video generation request accepted. (took ${duration}ms)`);
            console.log(`   Task/Operation:`, JSON.stringify(res));
        } catch (e: any) {
            console.error(`❌ Failed!`);
            console.error(`   Error: ${e?.message || e}`);
        }
    } else {
        console.log("⚠️ No active video model configured.");
    }

    console.log("\n[3] Testing Individual Channels (Detailed Provider Test)...");
    for (const p of providers) {
        if (!p.enabled) {
            console.log(`\n- Skipping disabled provider [${p.id}]`);
            continue;
        }
        console.log(`\n-----------------------------------------`);
        console.log(`Testing Provider: [${p.id}] (${p.name})`);
        console.log(`-----------------------------------------`);

        const pInstance = (mm as any).providers.get(p.id);
        if (!pInstance) {
            console.error(`❌ Provider instance for [${p.id}] not found inside ModelManager!`);
            continue;
        }

        // Test Text Model of this provider
        const textModel = p.chatModels?.[0];
        if (textModel) {
            console.log(`* Testing Chat Model [${textModel}]...`);
            try {
                const start = Date.now();
                const res = await pInstance.generateContent({
                    model: textModel,
                    contents: "Hello, confirm connection.",
                    config: { max_tokens: 10 }
                });
                console.log(`  ✅ Chat SUCCESS! (took ${Date.now() - start}ms) Response: "${res.text?.trim()}"`);
            } catch (e: any) {
                console.warn(`  ❌ Chat FAILED: ${e?.message || e}`);
            }
        } else {
            console.log(`* No chat models specified for provider [${p.id}]`);
        }

        // Test Image Model of this provider
        const imageModel = p.imageModels?.[0];
        if (imageModel) {
            console.log(`* Testing Image Model [${imageModel}]...`);
            try {
                const start = Date.now();
                const res = await pInstance.generateContent({
                    model: imageModel,
                    contents: "A blue dot",
                    config: {
                        imageConfig: {
                            aspectRatio: "1:1",
                            overrideNanoSize: "1K"
                        }
                    }
                });
                console.log(`  ✅ Image SUCCESS! (took ${Date.now() - start}ms)`);
            } catch (e: any) {
                console.warn(`  ❌ Image FAILED: ${e?.message || e}`);
            }
        } else {
            console.log(`* No image models specified for provider [${p.id}]`);
        }
    }

    console.log("\n=========================================");
    console.log("         Model Testing Completed         ");
    console.log("=========================================");
}

testConnection().catch(err => {
    console.error("Fatal error running connection test:", err);
});
