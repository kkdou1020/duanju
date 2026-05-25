import { useState } from 'react';
import { NovelChunk, Asset, GlobalStyle, Scene } from '@/shared/types';
import { generateVideo, pollVideoUntilDone } from '@/services/ai';
import { loadAssetUrl, saveAsset, downloadAndSaveVideo } from '@/services/storage';

import { extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';
import { matchAssetsToPrompt } from '@/services/ai/media/video';
import JSZip from 'jszip';
import { buildExportData } from '@/app/chunkUtils';
import saveAs from 'file-saver';

export interface UseChunkActionsProps {
    chunk: NovelChunk;
    allChunks: NovelChunk[];
    globalAssets?: Asset[];
    styleState: GlobalStyle;
    language: string;
    isActive: boolean;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => void;
    onSceneUpdate: (chunkId: string, sceneId: string, updates: Partial<Scene> | ((prevScene: Scene) => Partial<Scene>)) => void;
    onDuplicateScene: (chunkId: string, sceneId: string) => void;
    onExtract: (chunk: NovelChunk) => Promise<Asset[]>;
    onGenerateScript: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateBeats: (chunk: NovelChunk) => Promise<Scene[]>;
    onGeneratePrompts: (chunk: NovelChunk, targetSceneIds?: string[], onProgress?: (activeId: string | null, completedIds: string[]) => void) => Promise<Scene[]>;
    onGenerateImage: (scene: Scene, chunkAssets?: Asset[], optionId?: string, allScenes?: Scene[]) => Promise<string>;
    onToggle: () => void;
}

export function useChunkActions({
    chunk, allChunks, globalAssets = [], styleState, language, isActive,
    onUpdateChunk, onSceneUpdate, onDuplicateScene,
    onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage, onToggle
}: UseChunkActionsProps) {
    const [loadingStep, setLoadingStep] = useState<'none' | 'extracting' | 'storyboarding' | 'scripting' | 'filming'>('none');
    const [generatingSceneIds, setGeneratingSceneIds] = useState<string[]>([]);
    const [activePromptSceneId, setActivePromptSceneId] = useState<string | null>(null);
    const [completedPromptSceneIds, setCompletedPromptSceneIds] = useState<string[]>([]);
    const [scriptError, setScriptError] = useState<string | null>(null);
    const [exportProgress, setExportProgress] = useState<number | null>(null);
    const [showTextModal, setShowTextModal] = useState(false);
    const [editingText, setEditingText] = useState('');

    const combinedAssets = [...globalAssets, ...(chunk.assets || [])];

    // Chunk-level check for header warning only (not blocking)
    const anyAssetPending = chunk.assets.length > 0 && chunk.assets.some(a => !a.refImageUrl && !a.refImageAssetId && !a.refVideoUrl && !a.refAudioUrl);

    // Per-scene asset readiness
    const getSceneAssetsReady = (scene: Scene, optionId?: string): boolean => {
        // Find the prompt for the option
        let prompt = scene.np_prompt || '';
        if (optionId && scene.prompt_options) {
            const opt = scene.prompt_options.find(o => o.option_id === optionId);
            if (opt) prompt = opt.np_prompt || '';
        }

        // No prompt generated yet → not ready
        if (!prompt.trim()) return false;
        const tags = extractAssetTags(prompt).filter(t => !isStoryboardTag(t.name));
        if (tags.length === 0) return true;
        const referencedAssets: Asset[] = [];
        for (const tag of tags) {
            const asset = resolveTagToAsset(tag, combinedAssets);
            if (asset && !referencedAssets.some(a => a.id === asset.id)) {
                referencedAssets.push(asset);
            }
        }
        if (referencedAssets.length === 0) return true;
        return referencedAssets.every(a => !!a.refImageUrl || !!a.refImageAssetId || !!a.refVideoUrl || !!a.refAudioUrl);
    };



    // Per-scene VIDEO asset readiness
    const MAX_VIDEO_REFS = 3;
    const getVideoAssetsReady = (scene: Scene, optionId?: string): boolean => {
        // Find the prompt for the option
        let prompt = scene.video_prompt || '';
        if (optionId && scene.prompt_options) {
            const opt = scene.prompt_options.find(o => o.option_id === optionId);
            if (opt) prompt = opt.video_prompt || '';
        }

        // No video prompt generated yet → not ready
        if (!prompt.trim()) return false;
        const tags = extractAssetTags(prompt);
        if (tags.length === 0) return true;

        // Count unique references — block if exceeding limit
        const uniqueRefs = new Set(tags.map(t => t.id || t.name));
        if (uniqueRefs.size > MAX_VIDEO_REFS) return false;

        for (const tag of tags) {
            if (isStoryboardTag(tag.name)) {
                // 分镜标签 → check corresponding scene's imageUrl
                let idPart = tag.name.replace('分镜', '');
                // 必须先剥离末尾的“视频”或“video”，否则后面的 -([a-zA-Z0-9]+)$ 正则匹配不到
                idPart = idPart.replace(/(视频|video)$/, '');
                
                let optionSuffix: string | undefined;
                
                const suffixMatch = idPart.match(/-([a-zA-Z0-9]+)$/);
                if (suffixMatch) {
                    optionSuffix = suffixMatch[1];
                    idPart = idPart.substring(0, idPart.length - suffixMatch[0].length);
                }

                const allScenes = allChunks.flatMap(c => c.scenes);
                const target = allScenes.find(s => s.id === idPart || s.id.endsWith(`_${idPart}`));
                
                if (target) {
                    if (optionSuffix && target.prompt_options) {
                        const opt = target.prompt_options.find(o => o.option_id === optionSuffix || o.option_id === optionSuffix.toUpperCase());
                        if (opt && !opt.imageUrl && !opt.imageAssetId) return false;
                    } else if (!target.imageUrl && !target.imageAssetId) {
                        return false;
                    }
                } else {
                    return false; // Target scene not found
                }
            } else {
                // 资产标签 → check refImageUrl or refVideoUrl
                const asset = resolveTagToAsset(tag, combinedAssets);
                if (asset && !asset.refImageUrl && !asset.refImageAssetId && !asset.refVideoUrl && !asset.refAudioUrl) return false;
            }
        }
        return true;
    };

    const handleAddChunkAssets = (newAssets: Asset | Asset[]) => {
        const assetsToAdd = Array.isArray(newAssets) ? newAssets : [newAssets];
        onUpdateChunk(chunk.id, { assets: [...chunk.assets, ...assetsToAdd] });
    };

    const handleExtract = async () => {
        setLoadingStep('extracting');
        setScriptError(null);
        try {
            const newAssets = await onExtract(chunk);
            onUpdateChunk(chunk.id, { status: 'extracted' });
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error(e);
            setScriptError(e.message || "Failed to extract assets");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleScript = async () => {
        setLoadingStep('scripting');
        setScriptError(null);
        try {
            const scenes = await onGenerateScript(chunk);
            if (!scenes || scenes.length === 0) throw new Error("Received empty script from AI");
            onUpdateChunk(chunk.id, { scenes, status: 'scripted' });
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Script generation failed", e);
            setScriptError(e.message || "Failed to generate script. Please try again.");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleStoryboard = async () => {
        setLoadingStep('storyboarding');
        setScriptError(null);
        try {
            const scenes = await onGenerateBeats(chunk);
            if (!scenes || scenes.length === 0) throw new Error("Empty beat sheet from AI");
            // onGenerateBeats already calls updateChunk with storyboarded status
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Storyboard generation failed", e);
            setScriptError(e.message || "Failed to generate storyboard. Please try again.");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleGeneratePromptsAction = async () => {
        const scenesWithPrompts = chunk.scenes.filter(s => !!s.np_prompt?.trim() || (s.prompt_options && s.prompt_options.some(opt => !!opt.np_prompt?.trim())));
        const scenesWithoutPrompts = chunk.scenes.filter(s => !scenesWithPrompts.includes(s));

        let targetSceneIds: string[] | undefined = undefined;

        if (scenesWithPrompts.length === 0) {
            targetSceneIds = undefined; // Generate all
        } else if (scenesWithoutPrompts.length > 0) {
            const confirmMsg = language === 'Chinese'
                ? `${scenesWithPrompts.length}/${chunk.scenes.length} 个分镜已有提示词。\n\n点击「确定」仅生成缺失的 ${scenesWithoutPrompts.length} 个提示词。\n点击「取消」重新生成全部。`
                : `${scenesWithPrompts.length}/${chunk.scenes.length} scenes already have prompts.\n\nClick OK to generate the ${scenesWithoutPrompts.length} missing prompts.\nClick Cancel to regenerate all.`;
            if (window.confirm(confirmMsg)) {
                targetSceneIds = scenesWithoutPrompts.map(s => s.id);
            } else {
                targetSceneIds = undefined; // Regenerate all
            }
        } else {
            const confirmMsg = language === 'Chinese'
                ? `所有 ${chunk.scenes.length} 个分镜已有提示词，是否重新生成全部？`
                : `All ${chunk.scenes.length} scenes already have prompts. Regenerate all?`;
            if (!window.confirm(confirmMsg)) return;
            targetSceneIds = undefined; // Regenerate all
        }

        setActivePromptSceneId(null);
        setCompletedPromptSceneIds([]);
        setLoadingStep('scripting');
        setScriptError(null);
        try {
            const scenes = await onGeneratePrompts(chunk, targetSceneIds, (activeId, completedIds) => {
                setActivePromptSceneId(activeId);
                setCompletedPromptSceneIds(completedIds);
            });
            if (!scenes || scenes.length === 0) throw new Error("Empty prompts from AI");
            // onGeneratePrompts already calls updateChunk with scripted status
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Prompt generation failed", e);
            setScriptError(e.message || "Failed to generate prompts. Please try again.");
        } finally {
            setLoadingStep('none');
            setActivePromptSceneId(null);
            // intentionally NOT clearing completedPromptSceneIds so the checkmarks remain
        }
    };

    const handleDeleteScene = (sceneId: string) => {
        onUpdateChunk(chunk.id, (prev) => ({
            scenes: prev.scenes.filter(s => s.id !== sceneId)
        }));
    };

    const handleDuplicateScene = (sceneId: string) => {
        onDuplicateScene(chunk.id, sceneId);
    };

    const handleShoot = async () => {
        if (chunk.status === 'shooting' && generatingSceneIds.length > 0) return;

        const allScenesWithPrompt = chunk.scenes.filter(s => !!s.np_prompt?.trim());
        const scenesWithoutImage = allScenesWithPrompt.filter(s => {
            // Scene needs image if main image is missing AND any prompt option image is missing
            const mainMissing = !s.imageUrl && !s.imageAssetId;
            const optionsMissing = s.prompt_options ? s.prompt_options.some(opt => !opt.imageUrl && !opt.imageAssetId) : false;
            return mainMissing || optionsMissing;
        });
        const scenesWithImage = allScenesWithPrompt.filter(s => !scenesWithoutImage.includes(s));

        let scenesToProcess: Scene[];

        if (allScenesWithPrompt.length === 0) {
            // No scenes with prompts — nothing to do
            return;
        } else if (scenesWithoutImage.length === allScenesWithPrompt.length) {
            // Case 1: No images at all → generate all directly, no confirm needed
            scenesToProcess = scenesWithoutImage;
        } else if (scenesWithoutImage.length > 0) {
            // Case 2: Partial images → confirm, generate only missing ones or all
            const confirmMsg = language === 'Chinese'
                ? `${scenesWithImage.length}/${allScenesWithPrompt.length} 个分镜已有图片。\n\n点击「确定」仅生成缺失的 ${scenesWithoutImage.length} 张图片。\n点击「取消」不执行操作。`
                : `${scenesWithImage.length}/${allScenesWithPrompt.length} scenes already have images.\n\nClick OK to generate the ${scenesWithoutImage.length} missing images.\nClick Cancel to abort.`;
            if (!window.confirm(confirmMsg)) return;
            scenesToProcess = scenesWithoutImage;
        } else {
            // Case 3: All scenes already have images → ask to regenerate
            const confirmMsg = language === 'Chinese'
                ? `所有 ${allScenesWithPrompt.length} 个分镜已有图片，是否重新生成全部？`
                : `All ${allScenesWithPrompt.length} scenes already have images. Regenerate all?`;
            if (!window.confirm(confirmMsg)) return;
            scenesToProcess = allScenesWithPrompt;
        }

        if (scenesToProcess.length === 0) return;
        onUpdateChunk(chunk.id, { status: 'shooting' });
        const CONCURRENCY = 10;

        const processScene = async (scene: Scene) => {
            setGeneratingSceneIds(prev => [...prev, scene.id]);
            try {
                // If the scene has prompt_options, we should batch generate all missing options
                if (scene.prompt_options && scene.prompt_options.length > 0) {
                    const newOptions = [...scene.prompt_options];
                    let anyOptionUpdated = false;
                    let lastGeneratedUrl = scene.imageUrl;

                    await Promise.all(newOptions.map(async (opt, idx) => {
                        // Only generate if option missing image AND its specific references are ready
                        if (!opt.imageUrl && !opt.imageAssetId && getSceneAssetsReady(scene, opt.option_id)) {
                            const resultUrl = await onGenerateImage(scene, chunk.assets, opt.option_id, chunk.scenes);
                            newOptions[idx] = { ...newOptions[idx], imageUrl: resultUrl };
                            anyOptionUpdated = true;
                            lastGeneratedUrl = resultUrl;
                        }
                    }));

                    if (anyOptionUpdated) {
                        const updates: Partial<Scene> = { prompt_options: newOptions };
                        
                        // Update main scene imageUrl to the currently active option's image
                        const activeOpt = newOptions.find((o) => o.video_prompt === scene.video_prompt) || newOptions[0];
                        if (activeOpt.imageUrl) {
                            updates.imageUrl = activeOpt.imageUrl;
                        } else if (!scene.imageUrl) {
                            updates.imageUrl = lastGeneratedUrl;
                        }

                        if (scene.isStartEndFrameMode) {
                            const optionId = activeOpt.option_id;
                            updates.startEndAssetIds = [`scene_img_${scene.id}_${optionId}`];
                        } else if (scene.videoAssetIds === undefined) {
                            const optionId = activeOpt.option_id;
                            const currentSceneImgId = `scene_img_${scene.id}_${optionId}`;
                            const availableAssets = chunk.assets.filter(a => (scene.assetIds || []).includes(a.id));
                            const matched = matchAssetsToPrompt(scene.visual_desc || '', availableAssets, scene.assetIds || []);
                            updates.videoAssetIds = [currentSceneImgId, ...matched.slice(0, 2).map(a => a.id)];
                        }
                        onSceneUpdate(chunk.id, scene.id, updates);
                    }
                } else {
                    // Standard single generation fallback
                    const url = await onGenerateImage(scene, chunk.assets, undefined, chunk.scenes);
                    // Merge imageUrl + videoAssetIds into one update to avoid cascade re-renders
                    const updates: Partial<Scene> = { imageUrl: url };
                    if (scene.isStartEndFrameMode) {
                        updates.startEndAssetIds = [`scene_img_${scene.id}`];
                    } else if (scene.videoAssetIds === undefined) {
                        const currentSceneImgId = `scene_img_${scene.id}`;
                        const availableAssets = chunk.assets.filter(a => (scene.assetIds || []).includes(a.id));
                        const matched = matchAssetsToPrompt(scene.visual_desc || '', availableAssets, scene.assetIds || []);
                        updates.videoAssetIds = [currentSceneImgId, ...matched.slice(0, 2).map(a => a.id)];
                    }
                    onSceneUpdate(chunk.id, scene.id, updates);
                }
            } catch (e) {
                console.error(`Failed to gen image for scene ${scene.id}`, e);
            } finally {
                setGeneratingSceneIds(prev => prev.filter(id => id !== scene.id));
            }
        };

        try {
            const executing: Promise<void>[] = [];
            for (const scene of scenesToProcess) {
                const p = processScene(scene).then(() => {
                    const idx = executing.indexOf(p);
                    if (idx > -1) executing.splice(idx, 1);
                });
                executing.push(p);
                if (executing.length >= CONCURRENCY) {
                    await Promise.race(executing);
                }
            }
            await Promise.all(executing);
        } catch (e) {
            console.error("Batch shoot failed", e);
        } finally {
            onUpdateChunk(chunk.id, { status: 'completed' });
        }
    };

    const handleMakeFilm = async () => {
        const hasVideo = (s: Scene) => s.isStartEndFrameMode
            ? (!!s.startEndVideoUrl || !!s.startEndVideoAssetId)
            : (!!s.videoUrl || !!s.videoAssetId);
        const hasImage = (s: Scene) => !!s.imageUrl || !!s.imageAssetId;

        const allEligible = chunk.scenes.filter(s => hasImage(s));
        const scenesWithoutVideo = allEligible.filter(s => !hasVideo(s));
        const scenesWithVideo = allEligible.filter(s => hasVideo(s));

        if (allEligible.length === 0) return;

        let scenesToProcess: Scene[];
        if (scenesWithoutVideo.length === allEligible.length) {
            // Case 1: No videos at all → generate all directly
            scenesToProcess = scenesWithoutVideo;
        } else if (scenesWithoutVideo.length > 0) {
            // Case 2: Partial videos → confirm, generate only missing
            const confirmMsg = language === 'Chinese'
                ? `${scenesWithVideo.length}/${allEligible.length} 个分镜已有视频。\n\n点击「确定」仅生成缺失的 ${scenesWithoutVideo.length} 个视频。\n点击「取消」不执行操作。`
                : `${scenesWithVideo.length}/${allEligible.length} scenes already have videos.\n\nClick OK to generate the ${scenesWithoutVideo.length} missing videos.\nClick Cancel to abort.`;
            if (!window.confirm(confirmMsg)) return;
            scenesToProcess = scenesWithoutVideo;
        } else {
            // Case 3: All scenes already have videos → ask to regenerate
            const confirmMsg = language === 'Chinese'
                ? `所有 ${allEligible.length} 个分镜已有视频，是否重新生成全部？`
                : `All ${allEligible.length} scenes already have videos. Regenerate all?`;
            if (!window.confirm(confirmMsg)) return;
            scenesToProcess = allEligible;
        }

        if (scenesToProcess.length === 0) return;
        setLoadingStep('filming');

        const MAX_RETRIES = 5;
        const CONCURRENCY = 3;

        const processSceneWithRetry = async (scene: Scene) => {
            let imageToUse = scene.imageUrl;
            if (!imageToUse && scene.imageAssetId) {
                try {
                    imageToUse = await loadAssetUrl(scene.imageAssetId) || undefined;
                } catch (e) { console.error("Dynamic load failed", e); }
            }
            if (!imageToUse) return;

            let lastError;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    // Step 1: Submit (returns immediately)
                    const { operation } = await generateVideo(imageToUse, scene, styleState.aspectRatio, (scene.useAssets !== false) ? chunk.assets : [], styleState, chunk.scenes);
                    // Step 2: Poll until done
                    const { url } = await pollVideoUntilDone(operation);
                    
                    // Step 3: Download and save to IndexedDB to prevent CDN expiration
                    const { localUrl, assetId } = await downloadAndSaveVideo(url);

                    if (scene.isStartEndFrameMode) {
                        onSceneUpdate(chunk.id, scene.id, { startEndVideoUrl: localUrl, ...(assetId ? { startEndVideoAssetId: assetId } : {}), startEndVideoOperation: operation });
                    } else {
                        onSceneUpdate(chunk.id, scene.id, { videoUrl: localUrl, ...(assetId ? { videoAssetId: assetId } : {}), operation });
                    }
                    return;
                } catch (e: any) {
                    const errorMsg = e?.message || String(e);
                    console.warn(`Video Gen failed for scene ${scene.id} (Attempt ${attempt}/${MAX_RETRIES})`, errorMsg);
                    lastError = e;
                    const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
                    if (attempt < MAX_RETRIES) {
                        const baseDelay = 2000 * Math.pow(2, attempt - 1);
                        const actualDelay = isRateLimit ? baseDelay * 2 : baseDelay;
                        console.log(`Waiting ${actualDelay}ms before retry for scene ${scene.id}...`);
                        await new Promise(resolve => setTimeout(resolve, actualDelay));
                    }
                }
            }
            console.error(`Final failure for scene ${scene.id} after ${MAX_RETRIES} attempts`, lastError);
        };

        try {
            const executing: Promise<void>[] = [];
            for (const scene of scenesToProcess) {
                const p = processSceneWithRetry(scene).then(() => {
                    const idx = executing.indexOf(p);
                    if (idx > -1) executing.splice(idx, 1);
                });
                executing.push(p);
                if (executing.length >= CONCURRENCY) {
                    await Promise.race(executing);
                }
            }
            await Promise.all(executing);
        } finally {
            setLoadingStep('none');
        }
    };

    const handleSceneUpdateWrapper = (sceneId: string, fieldOrUpdates: keyof Scene | Partial<Scene>, value?: any) => {
        if (typeof fieldOrUpdates === 'string') {
            onSceneUpdate(chunk.id, sceneId, { [fieldOrUpdates]: value });
        } else {
            onSceneUpdate(chunk.id, sceneId, fieldOrUpdates);
        }
    };

    const handleImageGenerated = (sceneId: string, url: string, imageAssetId?: string, optionId?: string) => {
        onSceneUpdate(chunk.id, sceneId, (prevScene) => {
            // Merge imageUrl + videoAssetIds into one update to avoid cascade re-renders
            const updates: Partial<Scene> = { imageUrl: url, imageAssetId: imageAssetId };
            
            // Synchronize into prompt_options if this was a refresh for a specific option
            if (optionId && prevScene.prompt_options) {
                const newOptions = [...prevScene.prompt_options];
                const optIdx = newOptions.findIndex(o => o.option_id === optionId);
                if (optIdx !== -1) {
                    newOptions[optIdx] = { 
                        ...newOptions[optIdx], 
                        imageUrl: url, 
                        imageAssetId: imageAssetId 
                    };
                    updates.prompt_options = newOptions;
                }
            }
            
            if (prevScene.isStartEndFrameMode) {
                updates.startEndAssetIds = [`scene_img_${sceneId}`];
            } else if (prevScene.videoAssetIds === undefined) {
                const currentSceneImgId = `scene_img_${sceneId}`;
                const availableAssets = chunk.assets.filter(a => (prevScene.assetIds || []).includes(a.id));
                const matched = matchAssetsToPrompt(prevScene.visual_desc || '', availableAssets, prevScene.assetIds || []);
                updates.videoAssetIds = [currentSceneImgId, ...matched.slice(0, 2).map(a => a.id)];
            }
            
            return updates;
        });
    };

    const handleGenerateImageInternal = async (scene: Scene, optionId?: string) => {
        return await onGenerateImage(scene, chunk.assets, optionId, chunk.scenes);
    };

    const handleVideoGenerated = (sceneId: string, url: string, assetId?: string, optionId?: string, operation?: any) => {
        onSceneUpdate(chunk.id, sceneId, (prevScene) => {
            const updates: Partial<Scene> = {};

            if (prevScene.isStartEndFrameMode) {
                updates.startEndVideoUrl = url;
                updates.startEndVideoAssetId = assetId;
                updates.startEndVideoOperation = operation;
            } else {
                updates.videoUrl = url;
                updates.videoAssetId = assetId;
                updates.operation = operation;
            }

            // Synchronize into prompt_options if this was a refresh for a specific option
            if (optionId && prevScene.prompt_options) {
                const newOptions = [...prevScene.prompt_options];
                const optIdx = newOptions.findIndex(o => o.option_id === optionId);
                if (optIdx !== -1) {
                    newOptions[optIdx] = { 
                        ...newOptions[optIdx], 
                        videoUrl: url,
                        ...(assetId ? { videoAssetId: assetId } : {}),
                        operation: operation
                    };
                    updates.prompt_options = newOptions;
                }
            }

            return updates;
        });
    };

    const handleDownload = async () => {
        setExportProgress(0);
        try {
            const zip = new JSZip();

            const assetText = chunk.assets.map(a => `ID: ${a.id}\nName: ${a.name}\nDesc: ${a.description}\nDNA: ${a.visualDna || ''}`).join('\n---\n');
            zip.file("assets.txt", assetText);

            const chunkData = buildExportData(chunk);
            // Strip stale blob: URLs from exported data (they are session-specific and won't work on import)
            chunkData.assets = chunkData.assets.map((a: any) => ({
                ...a,
                refImageUrl: a.refImageUrl?.startsWith('blob:') ? undefined : a.refImageUrl,
            }));
            chunkData.scenes = chunkData.scenes.map((s: any) => ({
                ...s,
                imageUrl: s.imageUrl?.startsWith('blob:') ? undefined : s.imageUrl,
                videoUrl: s.videoUrl?.startsWith('blob:') ? undefined : s.videoUrl,
                startEndVideoUrl: s.startEndVideoUrl?.startsWith('blob:') ? undefined : s.startEndVideoUrl,
                narrationAudioUrl: s.narrationAudioUrl?.startsWith('blob:') ? undefined : s.narrationAudioUrl,
            }));
            zip.file("data.json", JSON.stringify(chunkData, null, 2));

            const imgFolder = zip.folder("images");
            const vidFolder = zip.folder("videos");
            const audioFolder = zip.folder("narration");

            const getBlob = async (url?: string, id?: string) => {
                if (url) {
                    const res = await fetch(url);
                    return res.blob();
                }
                if (id) {
                    const tempUrl = await loadAssetUrl(id);
                    if (tempUrl) {
                        const res = await fetch(tempUrl);
                        const b = await res.blob();
                        URL.revokeObjectURL(tempUrl);
                        return b;
                    }
                }
                return null;
            };

            for (const scene of chunk.scenes) {
                const imgBlob = await getBlob(scene.imageUrl, scene.imageAssetId);
                if (imgBlob) imgFolder?.file(`${scene.id}.png`, imgBlob);

                const vidBlob = await getBlob(scene.videoUrl, scene.videoAssetId);
                if (vidBlob) vidFolder?.file(`${scene.id}.mp4`, vidBlob);

                const seVidBlob = await getBlob(scene.startEndVideoUrl, scene.startEndVideoAssetId);
                if (seVidBlob) vidFolder?.file(`${scene.id}_startend.mp4`, seVidBlob);

                if (scene.narrationAudioUrl) {
                    const response = await fetch(scene.narrationAudioUrl);
                    const blob = await response.blob();
                    audioFolder?.file(`${scene.id}_narration.wav`, blob);
                }
            }

            const assetFolder = zip.folder("asset_refs");
            for (const asset of chunk.assets) {
                const assetBlob = await getBlob(asset.refImageUrl, asset.refImageAssetId);
                if (assetBlob) {
                    assetFolder?.file(`${asset.id}.png`, assetBlob);
                }
            }

            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                setExportProgress(metadata.percent);
            });
            saveAs(content, `nano_banana_chapter_${chunk.index + 1}.zip`);
        } catch (e: any) {
            console.error("Export failed", e);
            alert((language === 'Chinese' ? "导出失败: " : "Export Failed: ") + e.message);
        } finally {
            setExportProgress(null);
        }
    };

    return {
        // State
        loadingStep, scriptError, exportProgress,
        generatingSceneIds, activePromptSceneId, completedPromptSceneIds, getSceneAssetsReady, getVideoAssetsReady, anyAssetPending,
        showTextModal, setShowTextModal, editingText, setEditingText,

        // Handlers
        handleAddChunkAssets, handleExtract, handleScript,
        handleStoryboard, handleGeneratePromptsAction,
        handleDeleteScene, handleDuplicateScene,
        handleShoot, handleMakeFilm,
        handleSceneUpdateWrapper, handleImageGenerated,
        handleGenerateImageInternal, handleVideoGenerated,
        handleDownload,
    };
}
