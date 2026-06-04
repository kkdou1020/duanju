/**
 * Frontend API client — All calls to the backend business logic routes.
 * Replaces direct AI service imports (which now live on the backend).
 */

const API_BASE = (import.meta as any).env?.DEV ? 'http://127.0.0.1:3002/api' : '/api';

async function post<T = any>(path: string, body: any, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
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
    _onBatchComplete?: (episodes: any[], meta: any) => void,
    directorStyle?: string,
    directorStrength?: number
): Promise<NarrativeBlueprint> => {
    return post('/pipeline/analyze', { text, language, prevContext, episodeCount, directorStyle, directorStrength });
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

const blobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
    try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    resolve(null);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("[API] Failed to convert blob URL to base64", e);
        return null;
    }
};

/** 
 * Unified Dual-Track Asset Extraction Logic
 * Track 1: Strict ID match (scene_img_xxx or scene_video_xxx)
 * Track 2: Smart Name Fallback (E1分镜S03-A or 分镜S03)
 */
const resolveUsedAssets = async (prompt: string, assets: Asset[], allScenes: Scene[]): Promise<Asset[]> => {
    const tags = extractAssetTags(prompt);
    const usedAssets: Asset[] = [];

    for (const tag of tags) {
        let refUrl: string | undefined;
        let refAssetId: string | undefined;
        let isVideoRef = false;
        let resolved = false;

        // ── 1. Smart Name Fallback parsing (used if ID is missing or not a normal asset) ──
        let expectVideo = false;
        let expectImage = false;
        let parsedSceneId: string | undefined;
        let parsedOptionId: string | undefined;
        let exactSceneMatch: Scene | undefined;

        // Analyze explicit ID prefix
        if (tag.id) {
            if (tag.id.startsWith('scene_video_')) {
                expectVideo = true;
                exactSceneMatch = allScenes.find(s => tag.id!.includes(s.id));
            } else if (tag.id.startsWith('scene_img_')) {
                expectImage = true;
                exactSceneMatch = allScenes.find(s => tag.id!.includes(s.id));
            }
        }

        // Analyze Name pattern (Fallback)
        // Match things like "E1分镜SE1_S01-B", "E1分镜S03-A", "分镜S03"
        const nameMatch = tag.name.match(/^(?:E\d+)?分镜(?:E\d+_)?(?:scene_)?([a-zA-Z0-9_]+?)(?:-([a-zA-Z0-9]+))?$/);
        if (nameMatch) {
            parsedSceneId = nameMatch[1]; // e.g. S03 or SE1_S01
            parsedOptionId = nameMatch[2]; // e.g. A
            // If the name starts with E\d+分镜, it strongly implies a generated video
            if (/^(E\d+)分镜/.test(tag.name)) expectVideo = true;
            else if (!expectVideo) expectImage = true; // default to image
        }

        // ── 2. Scene Media Extraction (Image/Video) ──
        if (expectVideo || expectImage) {
            let targetScene = exactSceneMatch;

            if (!targetScene && parsedSceneId && allScenes.length > 0) {
                // The UI sometimes prepends 'S' to the raw scene ID (e.g. S03 for scene_03, or SE1_S01 for scene_E1_S01)
                const strippedSceneId = parsedSceneId.replace(/^S/, '');
                targetScene = allScenes.find(s => 
                    s.id === parsedSceneId || 
                    s.id.endsWith(`_${parsedSceneId}`) ||
                    s.id === strippedSceneId ||
                    s.id === `scene_${strippedSceneId}` ||
                    s.id.endsWith(`_${strippedSceneId}`)
                );
            }

            if (targetScene) {
                // Determine option ID (prefer parsed from name, fallback to last part of ID)
                let optId = parsedOptionId;
                if (!optId && tag.id) {
                    const parts = tag.id.split('_');
                    optId = parts[parts.length - 1]; 
                }

                if (expectVideo) {
                    // Extract Video
                    if (optId && targetScene.prompt_options) {
                        const opt = targetScene.prompt_options.find(o => o.option_id === optId || o.option_id === optId.toUpperCase());
                        if (opt && (opt.videoUrl || opt.videoAssetId)) {
                            refUrl = opt.videoUrl; refAssetId = opt.videoAssetId;
                        }
                    }
                    if (!refUrl && !refAssetId) {
                        refUrl = targetScene.videoUrl; refAssetId = targetScene.videoAssetId;
                    }
                } else {
                    // Extract Image
                    if (optId && targetScene.prompt_options) {
                        const opt = targetScene.prompt_options.find(o => o.option_id === optId || o.option_id === optId.toUpperCase());
                        if (opt && (opt.imageUrl || opt.imageAssetId)) {
                            refUrl = opt.imageUrl; refAssetId = opt.imageAssetId;
                        }
                    }
                    if (!refUrl && !refAssetId) {
                        refUrl = targetScene.imageUrl; refAssetId = targetScene.imageAssetId;
                    }
                }
                resolved = !!(refUrl || refAssetId);
                if (resolved) isVideoRef = expectVideo;
            }
        }

        // ── 3. Normal Asset Resolution (if not resolved as Scene Media) ──
        if (!resolved) {
            const asset = resolveTagToAsset(tag, assets);
            if (asset) {
                let finalAsset = { ...asset };
                if (finalAsset.refImageUrl?.startsWith('blob:') && finalAsset.refImageAssetId) {
                    try {
                        const base64 = await loadAssetBase64(finalAsset.refImageAssetId);
                        if (base64) {
                            finalAsset.refImageUrl = base64.replace(/^data:[^;]+/, 'data:image/png');
                        }
                    } catch (e) {
                        console.error("[API Debug] Failed to unpack normal asset reference from IndexedDB", e);
                    }
                }
                usedAssets.push(finalAsset);
                resolved = true;
            }
        }

        // ── 4. Finalize Scene Media Asset ──
        if (resolved && (refUrl || refAssetId)) {
            // Unpack from IndexedDB if necessary (including when refUrl is a browser local blob: URL)
            if (refAssetId && (!refUrl || refUrl.startsWith('blob:'))) {
                try {
                    refUrl = await loadAssetBase64(refAssetId) || undefined;
                } catch (e) {
                    console.error("[API Debug] Failed to unpack reference Blob from IndexedDB", e);
                }
            }

            // Push to used assets as a standard asset object
            usedAssets.push({
                id: tag.id || `scene_ref_${tag.name}`,
                name: tag.name,
                description: 'Storyboard Reference',
                type: 'item', 
                refImageUrl: isVideoRef ? undefined : refUrl,
                refVideoUrl: isVideoRef ? refUrl : undefined,
                refImageAssetId: isVideoRef ? undefined : refAssetId,
            });
        }
    }

    const finalizedAssets: Asset[] = [];
    for (const asset of usedAssets) {
        let finalAsset = { ...asset };
        if (finalAsset.refImageUrl?.startsWith('blob:')) {
            if (finalAsset.refImageAssetId) {
                try {
                    const base64 = await loadAssetBase64(finalAsset.refImageAssetId);
                    if (base64) {
                        finalAsset.refImageUrl = base64.replace(/^data:[^;]+/, 'data:image/png');
                    }
                } catch (e) {
                    console.error("[API Debug] Failed to unpack asset from IndexedDB in final check", e);
                }
            }
            if (finalAsset.refImageUrl?.startsWith('blob:')) {
                const base64 = await blobUrlToBase64(finalAsset.refImageUrl);
                if (base64) {
                    finalAsset.refImageUrl = base64.replace(/^data:[^;]+/, 'data:image/png');
                }
            }
        }
        finalizedAssets.push(finalAsset);
    }
    return finalizedAssets;
};

/** Generate a scene image (storyboard) */
export const generateSceneImage = async (
    scene: Scene,
    globalStyle?: GlobalStyle,
    assets: Asset[] = [],
    optionId?: string,
    allScenes?: Scene[],
    signal?: AbortSignal,
    customPrompt?: string
): Promise<any> => {
    const option = optionId && scene.prompt_options ? scene.prompt_options.find(o => o.option_id === optionId) : null;
    const prompt = customPrompt || (option ? (option.np_prompt || option.video_prompt || '') : (scene.np_prompt || scene.visual_desc || ''));

    // Resolve all tags using unified dual-track logic
    const usedAssets = await resolveUsedAssets(prompt, assets, allScenes || []);

    // Pre-upload heavy local assets to Cloud CDN to prevent Base64 payload bloat
    for (const asset of usedAssets) {
        if (asset.refImageUrl) {
            asset.refImageUrl = await uploadLocalMediaToCloud(asset.refImageUrl, `${asset.id}_image`);
        }
    }

    const styleToUse = getStyleWithLockedDna(globalStyle);

    return post('/media/scene-image', {
        scene,
        globalStyle: styleToUse,
        assets: usedAssets,
        optionId,
        customPrompt
    }, signal);
};

const uploadCache = new Map<string, string>();

/** 
 * Pre-upload local blob/base64 to cloud CDN to bypass Node.js memory limits and Base64 size expansion.
 * Uses FormData to upload directly via backend proxy.
 */
export const uploadLocalMediaToCloud = async (urlOrBase64: string, idHint?: string): Promise<string> => {
    if (!urlOrBase64) return urlOrBase64;
    if (urlOrBase64.startsWith('http')) return urlOrBase64; // Already a cloud URL

    const cacheKey = idHint || (urlOrBase64.length < 1000 ? urlOrBase64 : urlOrBase64.substring(0, 50) + urlOrBase64.length);
    if (uploadCache.has(cacheKey)) {
        return uploadCache.get(cacheKey)!;
    }

    try {
        const response = await fetch(urlOrBase64);
        const blob = await response.blob();
        const formData = new FormData();
        const ext = blob.type.split('/')[1] || 'bin';
        formData.append('file', blob, `upload.${ext}`);

        const res = await fetch(`${API_BASE}/media/upload`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            throw new Error(`Upload failed: ${res.status}`);
        }

        const data = await res.json();
        if (data.url) {
            uploadCache.set(cacheKey, data.url);
            return data.url;
        }
        return urlOrBase64;
    } catch (e) {
        console.error("Failed to pre-upload media to cloud:", e);
        return urlOrBase64; // Fallback to original data if upload fails
    }
};

/** Submit a video generation task (returns immediately) */
export const generateVideo = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    allScenes: Scene[] = [],
    optionId?: string,
    signal?: AbortSignal,
    customPrompt?: string
): Promise<{ taskId: string; operation: any }> => {
    const option = optionId && scene.prompt_options ? scene.prompt_options.find(o => o.option_id === optionId) : null;
    const prompt = customPrompt || (option ? (option.video_prompt || option.np_prompt || '') : (scene.video_prompt || scene.np_prompt || scene.visual_desc || ''));

    // Resolve all tags using unified dual-track logic
    const usedAssets = await resolveUsedAssets(prompt, assets, allScenes || []);

    // 关键修复：首尾帧可能没写在提示词里，也可能是“另一个分镜的图片”，强制构造为 Asset
    if (scene.isStartEndFrameMode && scene.startEndAssetIds) {
        for (const id of scene.startEndAssetIds) {
            if (id && !usedAssets.find(a => a.id === id)) {
                const asset = assets.find(a => a.id === id);
                if (asset) {
                    usedAssets.push(asset);
                } else {
                    // 可能是分镜图片，去 allScenes 里找 (支持以 scene_img_S02_A 等 option 后缀形式匹配)
                    const sceneMatch = allScenes.find(s => 
                        s.id === id || 
                        s.imageAssetId === id || 
                        `scene_img_${s.id}` === id ||
                        id.startsWith(`scene_img_${s.id}_`)
                    );
                    if (sceneMatch) {
                        // 解析可选的 Option ID (如从 scene_img_S02_A 提取出 A)
                        const prefix = `scene_img_${sceneMatch.id}_`;
                        const optId = id.startsWith(prefix) ? id.slice(prefix.length) : null;
                        
                        let actualUrl = '';
                        let imageAssetId = '';
                        
                        if (optId && sceneMatch.prompt_options) {
                            const opt = sceneMatch.prompt_options.find(
                                o => o.option_id === optId || o.option_id === optId.toUpperCase()
                            );
                            if (opt) {
                                actualUrl = opt.imageUrl || '';
                                imageAssetId = opt.imageAssetId || '';
                            }
                        }
                        
                        if (!actualUrl && !imageAssetId) {
                            actualUrl = sceneMatch.imageUrl || '';
                            imageAssetId = sceneMatch.imageAssetId || '';
                        }
                        
                        if (!actualUrl && imageAssetId) {
                            try {
                                const b64 = await loadAssetBase64(imageAssetId);
                                if (b64) {
                                    // loadAssetBase64 already returns a full data URL, so we just sanitize the mime type
                                    actualUrl = b64.replace(/^data:[^;]+/, 'data:image/png');
                                }
                            } catch (e) {
                                console.error('Failed to load scene asset base64', e);
                            }
                        }
                        
                        if (actualUrl) {
                            usedAssets.push({
                                id: id,
                                name: optId ? `Scene ${sceneMatch.id} Option ${optId}` : `Scene ${sceneMatch.id}`,
                                type: 'item', // generic type
                                description: '', // Required by Asset interface
                                refImageUrl: actualUrl,
                                refImageAssetId: imageAssetId || undefined
                            });
                        }
                    }
                }
            }
        }
    }

    // Pre-upload heavy local assets to Cloud CDN to prevent Base64 payload bloat
    for (const asset of usedAssets) {
        if (asset.refVideoUrl) {
            asset.refVideoUrl = await uploadLocalMediaToCloud(asset.refVideoUrl, `${asset.id}_video`);
        }
        if (asset.refImageUrl) {
            asset.refImageUrl = await uploadLocalMediaToCloud(asset.refImageUrl, `${asset.id}_image`);
        }
        if (asset.refAudioUrl) {
            asset.refAudioUrl = await uploadLocalMediaToCloud(asset.refAudioUrl, `${asset.id}_audio`);
        }
    }

    // Also pre-upload the base storyboard image if provided as a local blob/base64
    let finalImageBase64 = imageBase64;
    if (finalImageBase64 && !finalImageBase64.startsWith('http')) {
        finalImageBase64 = await uploadLocalMediaToCloud(finalImageBase64, `${scene.id}_${optionId || 'default'}_baseImage`);
    }

    const styleToUse = getStyleWithLockedDna(globalStyle);
    return post('/media/video', { imageBase64: finalImageBase64, scene, aspectRatio, assets: usedAssets, globalStyle: styleToUse, optionId, customPrompt }, signal);
}

/** Poll video generation status (single check) */
export const getVideoStatus = async (operation: any, signal?: AbortSignal): Promise<{ done: boolean; url?: string; error?: string }> => {
    return post('/media/video-status', { operation }, signal);
};

/** Poll until video is done (frontend-side polling loop) */
export const pollVideoUntilDone = async (
    operation: any,
    intervalMs: number = 5000,
    maxRetries: number = 180,
    onPoll?: (attempt: number) => void,
    signal?: AbortSignal
): Promise<{ url: string }> => {
    return new Promise((resolve, reject) => {
        const encodedOp = encodeURIComponent(JSON.stringify(operation));
        const url = `${API_BASE}/media/video-status-sse?operation=${encodedOp}`;
        const eventSource = new EventSource(url);
        
        let pollCount = 0;

        const cleanup = () => {
            eventSource.close();
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
        };

        const handleAbort = () => {
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        };

        if (signal) {
            if (signal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
            }
            signal.addEventListener('abort', handleAbort);
        }

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'poll') {
                    pollCount++;
                    if (onPoll) onPoll(pollCount);
                    if (pollCount >= maxRetries) {
                        cleanup();
                        reject(new Error("Video generation timed out after polling."));
                    }
                } else if (data.type === 'done') {
                    cleanup();
                    if (data.url) {
                        resolve({ url: data.url });
                    } else if (data.error) {
                        reject(new Error(data.error));
                    } else {
                        reject(new Error("Video generation completed but no output URL found."));
                    }
                }
            } catch (err) {
                cleanup();
                reject(err);
            }
        };

        eventSource.onerror = (err) => {
            cleanup();
            reject(new Error("SSE connection failed or was closed prematurely."));
        };
    });
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
    let cloudImages: string[] | undefined;
    if (images && images.length > 0) {
        cloudImages = await Promise.all(
            images.map((img, i) => uploadLocalMediaToCloud(img, `dna_ref_${Date.now()}_${i}`))
        );
    }
    return post('/style/visual-dna', { workStyle, textureStyle, language, useOriginalCharacters, images: cloudImages });
};

/** Analyze visual style from reference images */
export const analyzeVisualStyleFromImages = async (
    images: string[],
    language: string
): Promise<any> => {
    const cloudImages = await Promise.all(
        images.map((img, i) => uploadLocalMediaToCloud(img, `style_analysis_${Date.now()}_${i}`))
    );
    return post('/style/analyze-images', { images: cloudImages, language });
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

/** Refresh expired signed CDN video URLs using the task operation cache */
export const refreshVideoUrl = async (operation: any): Promise<{ url: string }> => {
    return post('/media/refresh-url', { operation });
};
