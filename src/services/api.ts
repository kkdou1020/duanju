/**
 * Frontend API client — All calls to the backend business logic routes.
 * Replaces direct AI service imports (which now live on the backend).
 */

const API_BASE = (import.meta as any).env?.DEV ? 'http://127.0.0.1:3002/api' : '/api';

async function post<T = any>(path: string, body: any): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `API Error: ${res.status}`);
    }
    return res.json();
}

async function get<T = any>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `API Error: ${res.status}`);
    }
    return res.json();
}

// =================== PIPELINE =====================

import { Scene, Asset, GlobalStyle } from '@/shared/types';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';
import { loadAssetBase64 } from '@/services/storage';
/**
 * Utility to enforce "Empty DNA if unlocked" rule.
 * Real-time usage: if visualDnaLocked is false, visualTags must be ignored.
 */
const getStyleWithLockedDna = (style?: GlobalStyle): GlobalStyle | undefined => {
    if (!style) return style;
    return {
        ...style,
        visualTags: style.visualDnaLocked ? style.visualTags : ''
    };
};

/**
 * Utility to strip heavy base64 image data from assets before sending to text-only endpoints.
 * This prevents 413 Payload Too Large errors on Google Cloud Run (32MB limit).
 */
const stripHeavyAssetData = (assets: Asset[]): any[] => {
    return assets.map(a => {
        const copy = { ...a };
        delete copy.refImageUrl;
        return copy;
    });
};

interface NarrativeBlueprint {
    batch_meta: any;
    episodes: any[];
}

interface MasterBeatSheet {
    visual_strategy: any;
    beats: any[];
}

/** Agent 1: Narrative Analysis */
export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    _onProgress?: (msg: string) => void,
    _onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    return post('/pipeline/analyze', { text, language, prevContext, episodeCount });
};

/** Agent 2 + A2: Generate BeatSheet + Extract Assets */
export const generateBeatSheet = async (
    episode: any,
    batch_meta: any,
    language: string,
    style: GlobalStyle,
    existingAssets: Asset[] = [],
    overrideText?: string
): Promise<{ beatSheet: MasterBeatSheet; assets: Asset[]; scenes: Scene[] }> => {
    const styleToUse = getStyleWithLockedDna(style);
    const lightweightAssets = stripHeavyAssetData(existingAssets);
    return post('/pipeline/beat-sheet', { episode, batch_meta, language, style: styleToUse, existingAssets: lightweightAssets, overrideText });
};

/** Agent 3: Generate Prompts from cached BeatSheet */
export const generatePromptsFromBeats = async (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle
): Promise<{ scenes: Scene[]; visualDna: string }> => {
    const styleToUse = getStyleWithLockedDna(style);
    const lightweightAssets = stripHeavyAssetData(assets);
    const result = await post<{ scenes: Scene[]; visualDna: string }>('/pipeline/prompts', {
        beatSheet, episodeNumber, language, assets: lightweightAssets, style: styleToUse
    });
    return result;
};

/** Agent 3: Generate Prompts with Streaming Support */
export const generatePromptsFromBeatsStream = async (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    onProgress: (scenes: Scene[], visualDna?: string) => void
): Promise<{ scenes: Scene[]; visualDna: string }> => {
    const styleToUse = getStyleWithLockedDna(style);
    const lightweightAssets = stripHeavyAssetData(assets);
    const res = await fetch(`${API_BASE}/pipeline/prompts-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatSheet, episodeNumber, language, assets: lightweightAssets, style: styleToUse })
    });

    if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
    }

    if (!res.body) {
        throw new Error("No response body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let finalScenes: Scene[] = [];
    let finalDna = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const data = JSON.parse(line);
                if (data.type === 'error') {
                    throw new Error(data.error);
                }

                if (data.type === 'chunk' && data.scenes) {
                    finalScenes = [...finalScenes, ...data.scenes];
                    if (data.visualDna) finalDna = data.visualDna;
                    onProgress(data.scenes, data.visualDna);
                }
            } catch (e) {
                console.error("Error parsing NDJSON line:", e, line);
            }
        }
    }

    return { scenes: finalScenes, visualDna: finalDna };
};

/** Legacy: Combined endpoint */
export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string
): Promise<Scene[]> => {
    const styleToUse = getStyleWithLockedDna(style);
    const lightweightAssets = stripHeavyAssetData(assets);
    const result = await post<{ scenes: Scene[] }>('/pipeline/episode-scenes', {
        episode, batch_meta, language, assets: lightweightAssets, style: styleToUse, overrideText
    });
    return result.scenes;
};

// =================== MEDIA =====================

/** Generate an asset reference image */
export const generateAssetImage = async (
    asset: Asset,
    globalStyle?: GlobalStyle,
    overridePrompt?: string,
    referenceImage?: string
): Promise<any> => {
    const styleToUse = getStyleWithLockedDna(globalStyle);
    return post('/media/asset-image', { asset, globalStyle: styleToUse, overridePrompt, referenceImage });
};

/** Pre-generate prompts for assets (pure computation, no AI call) */
export const buildAssetPrompts = async (
    assets: Asset[],
    globalStyle: GlobalStyle
): Promise<{ assets: Asset[] }> => {
    const styleToUse = getStyleWithLockedDna(globalStyle);
    return post('/media/build-asset-prompts', { assets, globalStyle: styleToUse });
};

/** Reverse engineer smart prompts for different camera angles */
export const reverseEngineerAngles = async (
    description: string,
    targetAngles: string[],
    imageBase64?: string,
    language?: string
): Promise<{ result: { angle: string; description: string }[] }> => {
    return post('/media/reverse-angles', { description, targetAngles, imageBase64, language });
};

/** Generate a scene image (storyboard) */
export const generateSceneImage = async (
    scene: Scene,
    globalStyle?: GlobalStyle,
    assets: Asset[] = [],
    optionId?: string,
    allScenes?: Scene[]
): Promise<any> => {
    const option = optionId && scene.prompt_options ? scene.prompt_options.find(o => o.option_id === optionId) : null;
    const prompt = option ? (option.np_prompt || option.video_prompt || '') : (scene.np_prompt || scene.visual_desc || '');

    // SSOT: The prompt text is the ONLY source of truth for assets in this generation
    const tags = extractAssetTags(prompt);

    // Separate Standard Tags from Storyboard Tags
    const storyboardTags = tags.filter(t => isStoryboardTag(t.name));
    const normalTags = tags.filter(t => !isStoryboardTag(t.name));

    // 1. Resolve standard assets
    const usedAssets: Asset[] = [];
    for (const tag of normalTags) {
        const asset = resolveTagToAsset(tag, assets);
        if (asset) usedAssets.push(asset);
    }

    // 2. Resolve storyboard reference images and treat them as normal assets!
    if (storyboardTags.length > 0 && allScenes) {
        for (const tag of storyboardTags) {
            let idPart = tag.name.replace('分镜', ''); // e.g. "S03-A"
            let optionSuffix: string | undefined;

            const suffixMatch = idPart.match(/-([a-zA-Z0-9]+)$/);
            if (suffixMatch) {
                optionSuffix = suffixMatch[1]; // "A"
                idPart = idPart.substring(0, idPart.length - suffixMatch[0].length); // "S03"
            }

            const targetRefId = tag.id || (optionSuffix ? `scene_img_${idPart}_${optionSuffix}` : `scene_img_${idPart}`);

            // Find the scene and option that matches the reference tag
            let refUrl: string | undefined;
            let refAssetId: string | undefined;

            // Resilient lookup: handle prefixes like 'E1_S03' when UI tag is just 'S03'
            const targetScene = allScenes.find(s => s.id === idPart || s.id.endsWith(`_${idPart}`));

            if (targetScene) {
                // Priority 1: Requesting a specific option (e.g., S03-A)
                if (optionSuffix && targetScene.prompt_options) {
                    const matchedOpt = targetScene.prompt_options.find(o =>
                        o.option_id === optionSuffix || o.option_id === optionSuffix.toUpperCase()
                    );
                    if (matchedOpt && (matchedOpt.imageUrl || matchedOpt.imageAssetId)) {
                        refUrl = matchedOpt.imageUrl;
                        refAssetId = matchedOpt.imageAssetId;
                    }
                }

                // Priority 2: Fallback to scene's default main image
                if (!refUrl && !refAssetId && (targetScene.imageUrl || targetScene.imageAssetId)) {
                    refUrl = targetScene.imageUrl;
                    refAssetId = targetScene.imageAssetId;
                }
            }

            if (refAssetId && !refUrl) {
                try {
                    // Unpack from IndexedDB if necessary
                    refUrl = await loadAssetBase64(refAssetId) || undefined;
                } catch (e) {
                    console.error("[API Debug] Failed to unpack reference image Blob from IndexedDB", e);
                }
            }

            if (refUrl || refAssetId) {
                // Treat the storyboard image as a normal asset and append it to our array
                usedAssets.push({
                    id: targetRefId,
                    name: tag.name,
                    description: 'Storyboard Reference',
                    type: 'item',
                    refImageUrl: refUrl,
                    refImageAssetId: refAssetId
                });
            }
        }
    }

    const styleToUse = getStyleWithLockedDna(globalStyle);

    return post('/media/scene-image', {
        scene,
        globalStyle: styleToUse,
        assets: usedAssets,
        optionId
    });
};

/** Submit a video generation task (returns immediately) */
export const generateVideo = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    allScenes: Scene[] = [],
    optionId?: string
): Promise<{ taskId: string; operation: any }> => {
    const option = optionId && scene.prompt_options ? scene.prompt_options.find(o => o.option_id === optionId) : null;
    const prompt = option ? (option.np_prompt || option.video_prompt || '') : (scene.np_prompt || scene.visual_desc || '');

    // SSOT: The video_prompt text is the ONLY source of truth for assets in this generation
    const tags = extractAssetTags(prompt);

    // Separate Standard Tags from Storyboard Tags
    const storyboardTags = tags.filter(t => isStoryboardTag(t.name));
    const normalTags = tags.filter(t => !isStoryboardTag(t.name));

    // 1. Resolve standard assets
    const usedAssets: Asset[] = [];
    for (const tag of normalTags) {
        const asset = resolveTagToAsset(tag, assets);
        if (asset) usedAssets.push(asset);
    }

    // 2. Resolve storyboard reference images and treat them as normal assets!
    if (storyboardTags.length > 0 && allScenes) {
        for (const tag of storyboardTags) {
            let idPart = tag.name.replace('分镜', ''); // e.g. "S03-A"
            let optionSuffix: string | undefined;

            const suffixMatch = idPart.match(/-([a-zA-Z0-9]+)$/);
            if (suffixMatch) {
                optionSuffix = suffixMatch[1]; // "A"
                idPart = idPart.substring(0, idPart.length - suffixMatch[0].length); // "S03"
            }

            const targetRefId = tag.id || (optionSuffix ? `scene_img_${idPart}_${optionSuffix}` : `scene_img_${idPart}`);

            // Find the scene and option that matches the reference tag
            let refUrl: string | undefined;
            let refAssetId: string | undefined;

            // Resilient lookup: handle prefixes like 'E1_S03' when UI tag is just 'S03'
            const targetScene = allScenes.find(s => s.id === idPart || s.id.endsWith(`_${idPart}`));

            if (targetScene) {
                // Priority 1: Requesting a specific option (e.g., S03-A)
                if (optionSuffix && targetScene.prompt_options) {
                    const matchedOpt = targetScene.prompt_options.find(o =>
                        o.option_id === optionSuffix || o.option_id === optionSuffix.toUpperCase()
                    );
                    if (matchedOpt && (matchedOpt.imageUrl || matchedOpt.imageAssetId)) {
                        refUrl = matchedOpt.imageUrl;
                        refAssetId = matchedOpt.imageAssetId;
                    }
                }

                // Priority 2: Fallback to scene's default main image
                if (!refUrl && !refAssetId && (targetScene.imageUrl || targetScene.imageAssetId)) {
                    refUrl = targetScene.imageUrl;
                    refAssetId = targetScene.imageAssetId;
                }
            }

            if (refAssetId && !refUrl) {
                try {
                    // Unpack from IndexedDB if necessary
                    refUrl = await loadAssetBase64(refAssetId) || undefined;
                } catch (e) {
                    console.error("[API Debug] Failed to unpack reference image Blob from IndexedDB", e);
                }
            }

            if (refUrl || refAssetId) {
                // Treat the storyboard image as a normal asset and append it to our array
                usedAssets.push({
                    id: targetRefId,
                    name: tag.name,
                    description: 'Storyboard Reference',
                    type: 'item',
                    refImageUrl: refUrl,
                    refImageAssetId: refAssetId
                });
            }
        }
    }

    const styleToUse = getStyleWithLockedDna(globalStyle);
    return post('/media/video', { imageBase64, scene, aspectRatio, assets: usedAssets, globalStyle: styleToUse, optionId });
};

/** Poll video generation status (single check) */
export const getVideoStatus = async (operation: any): Promise<{ done: boolean; url?: string; error?: string }> => {
    return post('/media/video-status', { operation });
};

/** Poll until video is done (frontend-side polling loop) */
export const pollVideoUntilDone = async (
    operation: any,
    intervalMs: number = 5000,
    maxRetries: number = 60,
    onPoll?: (attempt: number) => void
): Promise<{ url: string }> => {
    for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        if (onPoll) onPoll(i + 1);

        const status = await getVideoStatus(operation);

        if (status.error) {
            throw new Error(status.error);
        }

        if (status.done && status.url) {
            return { url: status.url };
        }
    }
    throw new Error("Video generation timed out after polling.");
};

/** Generate speech (TTS) */
export const generateSpeech = async (
    text: string,
    voice?: string,
    scene?: Scene
): Promise<any> => {
    return post('/media/speech', { text, voice, scene });
};

// =================== STYLE =====================

/** Extract assets from text (Agent A) */
export const extractAssets = async (
    text: string,
    language: string,
    existingAssets: Asset[] = [],
    workStyle: string = '',
    textureStyle: string = '',
    useOriginalCharacters: boolean = false,
    skipDna: boolean = false
): Promise<{ visualDna: string; assets: Asset[] }> => {
    const lightweightAssets = stripHeavyAssetData(existingAssets);
    return post<{ visualDna: string; assets: Asset[] }>('/style/extract-assets', {
        text, language, existingAssets: lightweightAssets, workStyle, textureStyle, useOriginalCharacters, skipDna
    });
};

/** Extract Visual DNA */
export const extractVisualDna = async (
    workStyle: string,
    textureStyle: string,
    language: string,
    useOriginalCharacters: boolean = false,
    images?: string[]
): Promise<any> => {
    return post('/style/visual-dna', { workStyle, textureStyle, language, useOriginalCharacters, images });
};

/** Analyze visual style from reference images */
export const analyzeVisualStyleFromImages = async (
    images: string[],
    language: string
): Promise<any> => {
    return post('/style/analyze-images', { images, language });
};

/** Extract assets from beat sheet */
export const extractAssetsFromBeats = async (
    beatSheet: any,
    language: string,
    existingAssets: Asset[] = [],
    workStyle: string = '',
    useOriginalCharacters: boolean = false
): Promise<Asset[]> => {
    const lightweightAssets = stripHeavyAssetData(existingAssets);
    const result = await post<{ assets: Asset[] }>('/style/extract-assets-from-beats', {
        beatSheet, language, existingAssets: lightweightAssets, workStyle, useOriginalCharacters
    });
    return result.assets;
};



// =================== CONFIG =====================

/** Get current model config */
export const getModelConfig = async (): Promise<any> => {
    return get('/config');
};

/** Set model config */
export const setModelConfig = async (config: {
    textmodel?: string;
    imagemodel?: string;
    videomodel?: string;
}): Promise<any> => {
    return post('/config', config);
};

// =================== UTILITY (constructVideoPrompt stays frontend-side) =====================
export { constructVideoPrompt } from '@/services/ai/media/video';
