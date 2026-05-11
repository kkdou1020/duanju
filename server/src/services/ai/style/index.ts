import { Asset, GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { retryWithBackoff, safeJsonParse, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";

// --- GENERATION FUNCTIONS ---

// --- Standalone Visual DNA extraction (Agent A1 only) ---
export const extractVisualDna = async (
    workStyle: string = '',
    textureStyle: string = '',
    language: string = 'Chinese',
    useOriginalCharacters: boolean = false,
    images?: string[]
): Promise<string> => {
    try {
        const parts: any[] = [];
        
        if (images && images.length > 0) {
            images.forEach(img => {
                const match = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                } else {
                    parts.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: img
                        }
                    });
                }
            });
        }
        
        parts.push({ text: "Analyze the visual style based on the provided style and texture references, as well as any provided images." });
        
        const dnaResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts },
            config: {
                systemInstruction: PROMPTS.AGENT_A_DNA(workStyle, textureStyle, language, useOriginalCharacters),
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
            }
        }));
        const dnaJson = safeJsonParse<{ visual_dna: string }>(dnaResponse.text, { visual_dna: "" });
        return dnaJson.visual_dna;
    } catch (e) {
        console.warn("[extractVisualDna] Agent A1 failed:", e);
        return "";
    }
};

export const generateStyleOptions = async (
    type: 'director' | 'work' | 'texture',
    seed: string,
    language: string = 'Chinese'
): Promise<string[]> => {
    const seedDigits = seed.split('').map(Number);
    const [d1] = seedDigits.length === 4 ? seedDigits : [5];
    let systemPrompt = "";
    if (type === 'director') systemPrompt = `Generate 20 film directors in ${language}. Diversity ${d1}/9.`;
    else if (type === 'work') systemPrompt = `Generate 20 visual works in ${language}. Art Style ${d1}/9.`;
    else if (type === 'texture') systemPrompt = `Generate 20 rendering styles in ${language}.`;

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: "Generate list.",
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
        }));
        return safeJsonParse(response.text, []);
    } catch (e) { return []; }
};

// --- AGENT A1 & A2 ---

export const analyzeVisualStyleFromImages = async (
    images: string[],
    language: string = 'Chinese'
): Promise<string> => {
    if (!images || images.length === 0) return "";

    const parts: any[] = [];
    images.forEach(img => {
        const match = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
            parts.push({
                inlineData: {
                    mimeType: match[1],
                    data: match[2]
                }
            });
        } else {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: img
                }
            });
        }
    });

    parts.push({ text: "Analyze the common visual style of these images." });

    const prompt = PROMPTS.VISUAL_DNA_FROM_IMAGES(language);

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts },
            config: {
                systemInstruction: prompt,
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
            }
        }));
        const json = safeJsonParse<{ visual_dna: string }>(response.text, { visual_dna: "" });
        return json.visual_dna;
    } catch (e) {
        console.error("Visual DNA from Images failed:", e);
        return "";
    }
};

export const extractAssets = async (
    text: string,
    language: string = 'Chinese',
    existingAssets: Asset[] = [],
    workStyle: string = '',
    textureStyle: string = '',
    useOriginalCharacters: boolean = false,
    skipDna: boolean = false
): Promise<{ visualDna: string; assets: Asset[] }> => {
    let visualDna = "";
    if (!skipDna) {
        try {
            const dnaResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: { parts: [{ text: "Analyze the visual style based on the provided style and texture references." }] },
                config: {
                    systemInstruction: PROMPTS.AGENT_A_DNA(workStyle, textureStyle, language),
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
                }
            }));
            const dnaJson = safeJsonParse<{ visual_dna: string }>(dnaResponse.text, { visual_dna: "" });
            visualDna = dnaJson.visual_dna;
        } catch (e) { console.warn("Agent A1 failed:", e); }
    } else {
        //console.log("[extractAssets] Skipping A1 (Visual DNA) — visualTags already exists.");
    }

    let assets: Asset[] = [];
    try {
        const assetResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: text }] },
            config: {
                systemInstruction: PROMPTS.AGENT_A_ASSET(language, existingAssets, workStyle, useOriginalCharacters),
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        assets: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    name: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    type: { type: Type.STRING, enum: ['character', 'location', 'item'] },
                                    parentId: { type: Type.STRING }
                                },
                                required: ["id", "name", "description", "type"]
                            }
                        }
                    }
                },
            }
        }));
        const assetJson = safeJsonParse<any>(assetResponse.text, { assets: [] });
        if (Array.isArray(assetJson)) {
            assets = assetJson;
        } else if (assetJson && Array.isArray(assetJson.assets)) {
            assets = assetJson.assets;
        } else {
            assets = [];
        }

    } catch (e) { console.warn("Agent A2 failed:", e); }

    return { visualDna, assets };
};

// --- Extract assets specifically from a MasterBeatSheet (for two-step pipeline) ---
export const extractAssetsFromBeats = async (
    beatSheet: any, // MasterBeatSheet
    language: string = 'Chinese',
    existingAssets: Asset[] = [],
    workStyle: string = '',
    useOriginalCharacters: boolean = false
): Promise<Asset[]> => {
    // Enrich each beat with all visual context (not just visual_action)
    const beatsText = (beatSheet.beats || [])
        .map((b: any) => [
            `[${b.beat_id}]`,
            `画面: ${b.visual_action || ''}`,
            b.camera_movement ? `运镜: ${b.camera_movement}` : '',
            b.lighting ? `灯光: ${b.lighting}` : '',
            b.audio_subtext ? `音效: ${b.audio_subtext}` : '',
        ].filter(Boolean).join(' | '))
        .join('\n');

    if (!beatsText.trim()) return [];

    let assets: Asset[] = [];
    try {
        const assetResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: beatsText }] },
            config: {
                systemInstruction: PROMPTS.AGENT_A2_FROM_BEATS(language, existingAssets, workStyle, useOriginalCharacters),
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        assets: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    name: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    type: { type: Type.STRING, enum: ['character', 'location', 'item'] },
                                    parentId: { type: Type.STRING }
                                },
                                required: ["id", "name", "description", "type"]
                            }
                        }
                    }
                },
            }
        }));
        const assetJson = safeJsonParse<any>(assetResponse.text, { assets: [] });
        if (Array.isArray(assetJson)) {
            assets = assetJson;
        } else if (assetJson && Array.isArray(assetJson.assets)) {
            assets = assetJson.assets;
        }
    } catch (e) { console.warn("[extractAssetsFromBeats] Agent A2 failed:", e); }

    return assets;
};

