import { Scene, Asset, GlobalStyle, GenerateContentResponse, VideosOperation } from "../../../shared/types";
import { retryWithBackoff, ai } from "../helpers";
import { validateImageFormats } from "./validators";
import { extractAssetTags, resolveTagToAsset, isStoryboardTag, stripAssetTags } from "../../../shared/asset-tags";
import { getModelManager } from "../model-manager";

// Helper: Smart Asset Matching
export const matchAssetsToPrompt = (prompt: string, assets: Asset[], explicitIds: string[] = []): Asset[] => {
    const availableAssets = assets.filter(a => !!a.refImageUrl);
    const scored = availableAssets.map(asset => {
        let score = 0;
        if (explicitIds.includes(asset.id)) score += 100;
        if (prompt.includes(asset.name)) score += 50;
        const assetTokens = (asset.description || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const promptTokens = prompt.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        let overlap = 0;
        assetTokens.forEach(token => {
            if (promptTokens.includes(token)) overlap++;
        });
        score += overlap * 5;
        return { asset, score };
    });
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.asset);
};

// Backend tag resolution removed. Handled by exact SSOT from frontend.

export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle, optionId?: string): string => {
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";
    let finalPrompt = "";
    
    const option = optionId && scene.prompt_options ? scene.prompt_options.find((o: any) => o.option_id === optionId) : null;
    const basePrompt = option ? (option.video_prompt || option.np_prompt || "") : (scene.video_prompt || scene.visual_desc || "");

    if (basePrompt) {
        if (stylePrefix && !basePrompt.startsWith(stylePrefix.trim())) {
            // Check if basePrompt starts with a duration tag like "0-8s:" or "0-4s:"
            const durationMatch = basePrompt.match(/^(\d+-\d+s:\s*)/i);
            if (durationMatch) {
                // Insert style prefix AFTER the duration tag
                finalPrompt = `${durationMatch[1]}${stylePrefix}${basePrompt.slice(durationMatch[0].length)}`;
            } else {
                finalPrompt = `${stylePrefix}${basePrompt}`;
            }
        } else {
            finalPrompt = basePrompt;
        }
    }

    const audioPrompts: string[] = [];
    if (scene.audio_dialogue && scene.audio_dialogue.length > 0) {
        const dialogueText = scene.audio_dialogue.map(d => {
            return d.speaker ? `${d.speaker}: ${d.text}` : d.text;
        }).join(' ');
        audioPrompts.push(`Character Dialogue: ${dialogueText}`);
    }
    if (scene.audio_sfx) {
        audioPrompts.push(`Sound Effect: ${scene.audio_sfx}`);
    }
    if (scene.audio_bgm) {
        audioPrompts.push(`Background Music: ${scene.audio_bgm}`);
    }

    if (audioPrompts.length > 0) {
        const separator = /[.!?]$/.test(finalPrompt.trim()) ? " " : ". ";
        finalPrompt = `${finalPrompt}${separator}${audioPrompts.join('. ')}`;
    }

    return finalPrompt;
};

export const parseMaxDurationFromPrompt = (prompt: string): number => {
    if (!prompt) return 8;
    
    // Match patterns like "0-6s", "3-8s", "0-4秒", "4-10 seconds", etc.
    const regex = /\b\d+\s*-\s*(\d+)\s*(?:s|秒|second|seconds)\b/gi;
    let match;
    let maxVal = 0;
    
    while ((match = regex.exec(prompt)) !== null) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxVal) {
            maxVal = val;
        }
    }
    
    if (maxVal > 0) {
        return Math.max(2, Math.min(maxVal, 15));
    }
    
    return 8; // fallback default
};

/**
 * Submit a video generation task and return immediately with the operation handle.
 * The frontend is responsible for polling via pollVideoStatus().
 */
export const submitVideoGeneration = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    allScenes: Scene[] = [], // Legacy parameter, kept for signature compatibility
    optionId?: string
): Promise<{ taskId: string; operation: any }> => {
    const option = optionId && scene.prompt_options ? scene.prompt_options.find((o: any) => o.option_id === optionId) : null;
    const modelConfigOverride: Partial<any> = {};
    const configSource = option || scene;
    if (configSource) {
        if (configSource.videomodel) modelConfigOverride.videomodel = configSource.videomodel;
        if (configSource.t8starVideoModel) modelConfigOverride.t8starVideoModel = configSource.t8starVideoModel;
    }

    const modelConfig = Object.keys(modelConfigOverride).length > 0 
        ? { ...getModelManager().getConfig(), ...modelConfigOverride } 
        : getModelManager().getConfig();
    let model = modelConfig.t8starVideoModel || "veo3.1-components";

    // 智能路由：仅当选用普通 Veo 3.1 系列时，根据模式自动切换
    if (model === "veo" || model === "veo3.1" || model === "veo3.1-components") {
        model = scene.isStartEndFrameMode ? "veo3.1" : "veo3.1-components";
    }
    
    const isSeedance = model.includes("seedance") || model.includes("doubao");

    const fullPrompt = constructVideoPrompt(scene, globalStyle, optionId);
    let imagesToSend: string[] = [];
    let videosToSend: string[] = [];
    let audiosToSend: string[] = [];

    let instructions = "";
    const nameToAliasMap = new Map<string, string>();
    let charCount = 0;
    let locCount = 0;
    let itemCount = 0;
    let refFrameCount = 0;

    let seedanceContent: any[] = [];
    let imageIndex = 1;
    let videoIndex = 1;
    let audioIndex = 1;

    if (scene.isStartEndFrameMode) {
        if (imageBase64) {
            imagesToSend.push(imageBase64);
            if (isSeedance) seedanceContent.push({ type: 'image_url', image_url: { url: imageBase64 }, role: 'first_frame' });
        }

        const endId = scene.startEndAssetIds?.[1];
        const endImgUrl = assets.find(a => a.id === endId)?.refImageUrl;
        if (endImgUrl) {
            imagesToSend.push(endImgUrl);
            if (isSeedance) seedanceContent.push({ type: 'image_url', image_url: { url: endImgUrl }, role: 'last_frame' });
        }
    } else {
        // Default Mode: Pure multi-modal reference without forcing first frame
        if (assets && assets.length > 0) {
            // Deduplicate assets by ID to prevent duplicating prompts/images
            const uniqueAssets = Array.from(new Map(assets.map(a => [a.id, a])).values());
            
            uniqueAssets.forEach(asset => {
                let alias = "";
                if (isStoryboardTag(asset.name)) {
                    alias = `[Reference ${String.fromCharCode(65 + refFrameCount++)}]`;
                } else if (asset.type === 'character') {
                    alias = `[Character ${String.fromCharCode(65 + charCount++)}]`;
                } else if (asset.type === 'item') {
                    alias = `[Object ${String.fromCharCode(65 + itemCount++)}]`;
                } else {
                    alias = `[Location ${String.fromCharCode(65 + locCount++)}]`;
                }
                nameToAliasMap.set(asset.name, alias);

                if (asset.refVideoUrl) {
                    videosToSend.push(asset.refVideoUrl);
                    instructions += ` 视频${videoIndex}是 ${alias}。`;
                    if (isSeedance) {
                        seedanceContent.push({ type: 'video_url', video_url: { url: asset.refVideoUrl }, role: 'reference_video' });
                    }
                    videoIndex++;
                } else if (asset.refAudioUrl) {
                    audiosToSend.push(asset.refAudioUrl);
                    instructions += ` 音频${audioIndex}是 ${alias}。`;
                    if (isSeedance) {
                        seedanceContent.push({ type: 'audio_url', audio_url: { url: asset.refAudioUrl }, role: 'reference_audio' });
                    }
                    audioIndex++;
                } else if (asset.refImageUrl || asset.refImageAssetId) {
                    const imgUrl = (asset.refImageUrl || asset.refImageAssetId) as string;
                    imagesToSend.push(imgUrl);
                    instructions += ` 图片${imageIndex}是 ${alias}。`;
                    if (isSeedance) {
                        seedanceContent.push({ type: 'image_url', image_url: { url: imgUrl }, role: 'reference_image' });
                    }
                    imageIndex++;
                }
            });
            console.log(`[VideoGen] Added ${imagesToSend.length} images, ${videosToSend.length} videos, ${audiosToSend.length} audios.`);
        }
    }

    // Apply mappings to the prompt
    let processedPrompt = fullPrompt;
    if (isSeedance && instructions) {
        const ASSET_TAG_REGEX_LOCAL = /\[@图像_([^#\]]+)(?:#([a-zA-Z0-9_\-]+))?\]|@图像_([^\s，。,.;；：:！!？?、）)｝}\]\[（(｛{@#]+)(?:#([a-zA-Z0-9_\-]+))?/g;
        processedPrompt = fullPrompt.replace(ASSET_TAG_REGEX_LOCAL, (match, p1, p2, p3, p4) => {
            const name = p1 || p3;
            if (name && nameToAliasMap.has(name)) {
                return nameToAliasMap.get(name)!;
            }
            return name || match;
        });
        processedPrompt = `${instructions.trim()} ${processedPrompt}`;
    } else {
        processedPrompt = stripAssetTags(fullPrompt);
    }

    let safePrompt = processedPrompt;
    if (!isSeedance) {
        safePrompt = processedPrompt.substring(0, 800);
    } else {
        safePrompt = processedPrompt.substring(0, 2000);
    }
    const enhancePrompt = /[^\x00-\x7F]/.test(safePrompt);

    // 安全阀门与硬性拦截规则
    if (isSeedance) {
        imagesToSend = imagesToSend.slice(0, 9);
        videosToSend = videosToSend.slice(0, 3);
        audiosToSend = audiosToSend.slice(0, 3);
    } else {
        if (videosToSend.length > 0 || audiosToSend.length > 0) {
            throw new Error("模型不匹配：您当前选择的传统模型不支持【视频/音频】参考。请切换至 Seedance 2.0 模型，或在提示词中移除对视频/音频的 @ 引用。");
        }
        imagesToSend = imagesToSend.slice(0, 3);
    }

    // Filter out invalid images (but KEEP them as pure URLs instead of downloading/Base64 converting)
    // Both Seedance (V3) and Veo (V2) models natively accept HTTP URLs on the T8Star platform.
    const validImages = imagesToSend.filter(img => img && img.trim().length > 0);
    validateImageFormats(validImages);

    const seconds = parseMaxDurationFromPrompt(fullPrompt);

    try {
        const operationResult = await retryWithBackoff(async () => {
            return await ai.models.generateVideos({
                model,
                prompt: safePrompt,
                config: {
                    enhance_prompt: enhancePrompt,
                    images: validImages,
                    videos: videosToSend,
                    audios: audiosToSend,
                    seedanceContent: isSeedance ? seedanceContent : undefined,
                    aspectRatio: aspectRatio,
                    seconds: seconds,
                    modelConfig: Object.keys(modelConfigOverride).length > 0 ? modelConfigOverride : undefined
                }
            });
        }, 3, 2000);

        const taskId = operationResult.operation?.id;
        if (!taskId) throw new Error("Video generation failed to start (no task ID).");

        console.log(`[VideoGen] Task submitted: ${taskId}`);
        return { taskId, operation: operationResult };
    } catch (e: any) {
        console.error("Veo Submission Error:", e);
        throw new Error(`Video Submission Failed: ${e?.message || String(e)}`);
    }
};

/**
 * Poll the status of a single video generation task.
 * Returns { done, url?, error? }.
 */
export const pollVideoStatus = async (
    operation: any
): Promise<{ done: boolean; url?: string; error?: string }> => {
    try {
        const statusResult = await ai.operations.getVideosOperation({ operation });

        if (statusResult.error) {
            return { done: true, error: String(statusResult.error) };
        }

        if (statusResult.done) {
            const outputUrl = statusResult.response?.generatedVideos?.[0]?.video?.uri;
            if (!outputUrl) {
                return { done: true, error: "Video generation completed but no output URL found." };
            }
            return { done: true, url: outputUrl };
        }

        return { done: false };
    } catch (e: any) {
        return { done: true, error: `Poll error: ${e?.message || String(e)}` };
    }
};
