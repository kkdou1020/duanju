import { useState, useRef, useMemo, useEffect } from 'react';
import { Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { matchAssetsToPrompt } from '@/services/ai';
import { ASSET_TAG_REGEX } from '@/shared/asset-tags';
import { loadAssetBase64, saveAsset, deleteAsset } from '@/services/storage';

export interface UseSceneAssetsProps {
    scene: Scene;
    assets: Asset[];
    globalStyle: GlobalStyle;
    language: string;
    chapterScenes: Scene[];
    allChunks: NovelChunk[];
    chunk: NovelChunk;
    onUpdate: (id: string, fieldOrUpdates: keyof Scene | Partial<Scene>, value?: any) => void;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => void;
}

export function useSceneAssets(props: UseSceneAssetsProps) {
    const { scene, assets, globalStyle, language, chapterScenes, allChunks, chunk, onUpdate, onUpdateChunk } = props;

    const [activeAssetSelector, setActiveAssetSelector] = useState<'none' | 'image' | 'video'>('none');


    const lastProcessedImageAssetsRef = useRef<string[]>(scene.assetIds || []);
    const lastProcessedVideoAssetsRef = useRef<string[]>(
        scene.isStartEndFrameMode
            ? (scene.startEndAssetIds || [])
            : (scene.videoAssetIds || [])
    );
    const lastProcessedSpecsRef = useRef({
        video_duration: scene.video_duration,
        video_camera: scene.video_camera,
        video_lens: scene.video_lens,
        video_vfx: scene.video_vfx
    });

    // Reset refs when scene ID changes
    const lastSceneIdRef = useRef(scene.id);
    if (lastSceneIdRef.current !== scene.id) {
        lastSceneIdRef.current = scene.id;
        lastProcessedImageAssetsRef.current = scene.assetIds || [];
        lastProcessedVideoAssetsRef.current = scene.isStartEndFrameMode
            ? (scene.startEndAssetIds || [])
            : (scene.videoAssetIds || []);
        lastProcessedSpecsRef.current = {
            video_duration: scene.video_duration,
            video_camera: scene.video_camera,
            video_lens: scene.video_lens,
            video_vfx: scene.video_vfx
        };
    }

    // ── Scene Asset Resolver ──
    const resolveSceneAssets = (newAssetIds: string[], overrideAssets?: Asset[]): Asset[] => {
        let assetsToUse = overrideAssets || assets;
        newAssetIds.forEach(id => {
            if (id.startsWith('scene_img_') && !assetsToUse.find(a => a.id === id)) {
                if (id === `scene_img_${scene.id}`) {
                    assetsToUse = [...assetsToUse, {
                        id,
                        name: "分镜图",
                        description: "当前分镜已生成的图片 (Current Scene)",
                        type: "item",
                        refImageUrl: scene.imageUrl
                    }];
                } else {
                    const sceneId = id.replace('scene_img_', '');
                    const refScene = chapterScenes.find(s => s.id === sceneId);
                    if (refScene) {
                        assetsToUse = [...assetsToUse, {
                            id,
                            name: `Scene ${refScene.id}`,
                            description: refScene.visual_desc || "Generated storyboard",
                            type: "item",
                            refImageUrl: refScene.imageUrl,
                            refImageAssetId: refScene.imageAssetId
                        }];
                    }
                }
            }
        });
        return assetsToUse;
    };

    // ── Spec Commit (just save, no AI call) ──
    const handleSpecCommit = (field: keyof Scene, value: string) => {
        onUpdate(scene.id, field, value);
    };

    const handleLocalSpecChange = (field: keyof Scene, value: string) => {
        onUpdate(scene.id, field, value);
    };

    // ── Asset Add / Remove ──
    // Helper: append @图像 tag for newly added asset to prompt (with #id anchor)
    const appendTagToPrompt = (prompt: string, assetId: string, overrideAssets?: Asset[]): string => {
        const allAssets = overrideAssets ? [...assets, ...overrideAssets] : assets;
        const asset = allAssets.find(a => a.id === assetId);
        if (!asset) return prompt;
        // Allow duplicate tags — dedup happens downstream in video.ts/agent3-asset.ts
        const tag = `[@图像_${asset.name}#${asset.id}]`;
        return prompt ? `${prompt} ${tag}` : tag;
    };

    const handleAddAsset = (assetId: string | string[], newAsset?: Asset | Asset[]) => {
        const assetIdsToAdd = Array.isArray(assetId) ? assetId : [assetId];
        const newAssetsToAdd = newAsset ? (Array.isArray(newAsset) ? newAsset : [newAsset]) : [];

        if (activeAssetSelector === 'video') {
            if (scene.isStartEndFrameMode) {
                const targetAssetId = assetIdsToAdd[0];
                const currentSceneImgId = `scene_img_${scene.id}`;
                const newIds = [currentSceneImgId, targetAssetId];
                onUpdate(scene.id, 'video_prompt_backup', scene.video_prompt);
                onUpdate(scene.id, 'startEndAssetIds', newIds);
            } else {
                // Allow duplicate tags in prompt — dedup for videoAssetIds, append all to prompt
                const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
                const uniqueNewIds = assetIdsToAdd.filter(id => !currentVideoIds.includes(id));
                // Sync: append @图像 tags to video prompt (allows duplicates)
                let prompt = scene.video_prompt || scene.visual_desc || '';
                const promptField = scene.video_prompt ? 'video_prompt' : 'visual_desc';
                for (const id of assetIdsToAdd) {
                    prompt = appendTagToPrompt(prompt, id, newAssetsToAdd);
                }

                if (uniqueNewIds.length > 0) {
                    const newIds = [...currentVideoIds, ...uniqueNewIds];
                    onUpdate(scene.id, {
                        videoAssetIds: newIds,
                        [promptField]: prompt
                    });
                } else {
                    onUpdate(scene.id, promptField, prompt);
                }
            }
        } else {
            const currentIds = scene.assetIds || [];
            const uniqueNewIds = assetIdsToAdd.filter(id => !currentIds.includes(id));
            if (uniqueNewIds.length > 0) {
                const newIds = [...currentIds, ...uniqueNewIds];
                let prompt = scene.np_prompt || '';
                for (const id of uniqueNewIds) {
                    prompt = appendTagToPrompt(prompt, id, newAssetsToAdd);
                }
                onUpdate(scene.id, {
                    assetIds: newIds,
                    np_prompt: prompt
                });
            }
        }
        setActiveAssetSelector('none');
    };

    // Helper: remove @图像 tags matching an asset from prompt text
    // Uses EXACT matching only (name or #id) — no fuzzy includes()
    const removeTagFromPrompt = (prompt: string, assetId: string): string => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !prompt) return prompt;
        return prompt.replace(
            ASSET_TAG_REGEX,
            (match, p1, p2, p3, p4) => {
                const tagName = p1 || p3;
                const tagIdAnchor = p2 || p4;
                // Match by #id anchor (exact)
                if (tagIdAnchor && tagIdAnchor === asset.id) return '';
                // Match by exact name or exact id
                if (tagName === asset.name || tagName === asset.id) return '';
                return match;
            }
        ).replace(/\s{2,}/g, ' ');
    };

    const handleRemoveAsset = (assetId: string, mode: 'image' | 'video' = 'image') => {
        if (mode === 'video') {
            if (scene.isStartEndFrameMode) {
                const currentSceneImgId = `scene_img_${scene.id}`;
                const newIds = [currentSceneImgId];
                onUpdate(scene.id, 'startEndAssetIds', newIds);
                if (scene.video_prompt_backup) {
                    onUpdate(scene.id, 'video_prompt', scene.video_prompt_backup);
                    onUpdate(scene.id, 'video_prompt_backup', undefined);
                }
            } else {
                const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
                const newIds = currentVideoIds.filter(id => id !== assetId);
                onUpdate(scene.id, 'videoAssetIds', newIds);
                // Sync: remove @图像 tag from video prompt
                if (scene.video_prompt) {
                    onUpdate(scene.id, 'video_prompt', removeTagFromPrompt(scene.video_prompt, assetId));
                } else if (scene.visual_desc) {
                    onUpdate(scene.id, 'visual_desc', removeTagFromPrompt(scene.visual_desc, assetId));
                }
            }
        } else {
            const currentIds = scene.assetIds || [];
            const newIds = currentIds.filter(id => id !== assetId);
            onUpdate(scene.id, 'assetIds', newIds);
            // Sync: remove @图像 tag from image prompt
            if (scene.np_prompt) {
                onUpdate(scene.id, 'np_prompt', removeTagFromPrompt(scene.np_prompt, assetId));
            }
        }
    };

    // ── Scene images with async fallback ──
    const [sceneImages, setSceneImages] = useState<{
        id: string; name: string; description: string;
        type: 'item'; refImageUrl?: string; refImageAssetId?: string;
    }[]>([]);

    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            const resolved = [];
            for (const s of chapterScenes) {
                let hasOptionImages = false;
                // If scene has prompt_options, we should create a reference tag for each option that has an image
                if (s.prompt_options && s.prompt_options.length > 0) {
                    for (const opt of s.prompt_options) {
                        if (opt.imageUrl || opt.imageAssetId) {
                            hasOptionImages = true;
                            let url = opt.imageUrl;
                            if (!url && opt.imageAssetId) {
                                url = await loadAssetBase64(opt.imageAssetId) || undefined;
                            }
                            resolved.push({
                                id: `scene_img_${s.id}_${opt.option_id}`,
                                name: `分镜${s.id}-${opt.option_id}`,
                                description: s.visual_desc || "Generated storyboard",
                                type: 'item' as const,
                                refImageUrl: url,
                                refImageAssetId: opt.imageAssetId
                            });
                        }
                    }
                } 
                
                // Also always add the base scene reference tag for backward compatibility 
                // ONLY if there are no option images, to avoid UI clutter
                if (!hasOptionImages && (s.imageUrl || s.imageAssetId)) {
                    let url = s.imageUrl;
                    if (!url && s.imageAssetId) {
                        url = await loadAssetBase64(s.imageAssetId) || undefined;
                    }
                    resolved.push({
                        id: `scene_img_${s.id}`,
                        name: `分镜${s.id}`,
                        description: s.visual_desc || "Generated storyboard",
                        type: 'item' as const,
                        refImageUrl: url,
                        refImageAssetId: s.imageAssetId
                    });
                }
            }
            if (!cancelled) setSceneImages(resolved);
        };
        resolve();
        return () => { cancelled = true; };
    }, [chapterScenes]);

    // ── Extract Global Videos & Audios ──
    const sceneVideos = useMemo(() => {
        const videos: any[] = [];
        for (const c of allChunks) {
            for (const s of c.scenes) {
                if (s.prompt_options && s.prompt_options.length > 0) {
                    s.prompt_options.forEach((opt, index) => {
                        if (opt.videoUrl || opt.videoAssetId) {
                            const optionLabel = String.fromCharCode(65 + index); // A, B, C
                            videos.push({
                                id: `scene_video_${c.id}_${s.id}_${opt.option_id}`,
                                name: `E${c.index + 1}分镜S${s.id.replace('scene_', '')}-${opt.option_id || optionLabel}`,
                                description: s.visual_desc || "Generated video",
                                type: 'item',
                                refImageUrl: opt.imageUrl || undefined // Use thumbnail if available
                            });
                        }
                    });
                } else if (s.videoUrl || s.videoAssetId || s.startEndVideoAssetId) {
                    videos.push({
                        id: `scene_video_${c.id}_${s.id}`,
                        name: `E${c.index + 1}分镜S${s.id.replace('scene_', '')}-A`,
                        description: s.visual_desc || "Generated video",
                        type: 'item',
                        refImageUrl: s.imageUrl || undefined
                    });
                }
            }
        }
        
        // Add chunk uploaded videos
        const uploadedVideos = chunk.assets.filter(a => a.type === 'video').map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            type: 'item',
            refImageUrl: a.refImageUrl,
            canDelete: true
        }));
        
        return [...videos, ...uploadedVideos];
    }, [allChunks, chunk.assets]);

    const sceneAudios = useMemo(() => {
        // Add chunk uploaded audios
        const uploadedAudios = chunk.assets.filter(a => a.type === 'audio').map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            type: 'item',
            refImageUrl: a.refImageUrl,
            canDelete: true
        }));
        return uploadedAudios;
    }, [chunk.assets]);

    const handleAssetUpload = async (type: 'video' | 'audio', file: File) => {
        try {
            // Save to IndexedDB
            const blob = new Blob([file], { type: file.type });
            const assetId = await saveAsset(blob);
            
            // Generate a safe name from filename
            const fileName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
            
            const newAsset: Asset = {
                id: assetId,
                name: fileName,
                description: `上传的${type === 'video' ? '视频' : '音频'}素材`,
                type: type as any,
            };
            
            // Add to chunk assets
            onUpdateChunk(chunk.id, (prev) => ({
                assets: [...prev.assets, newAsset]
            }));
            
            return assetId;
        } catch (e) {
            console.error('Failed to upload asset', e);
            alert(`上传${type === 'video' ? '视频' : '音频'}失败: ` + e);
            return undefined;
        }
    };

    const handleAssetDelete = async (assetId: string) => {
        console.log("handleAssetDelete called with assetId:", assetId);
        
        // Remove from chunk assets FIRST for immediate UI feedback
        onUpdateChunk(chunk.id, (prev) => {
            const assets = prev.assets || [];
            console.log("Previous chunk assets:", assets);
            const filtered = assets.filter(a => a.id !== assetId);
            console.log("Filtered chunk assets:", filtered);
            return { assets: filtered };
        });

        // Then delete from IndexedDB
        try {
            await deleteAsset(assetId);
        } catch (e) {
            console.warn('Failed to delete asset from DB', e);
        }
    };

    // ── Initialize video asset IDs when image first appears ──
    const initializeVideoAssetIds = () => {
        if (!scene.isStartEndFrameMode && scene.videoAssetIds === undefined) {
            // Determine which option is active, if any
            const optionId = scene.prompt_options?.find(o => o.video_prompt === scene.video_prompt)?.option_id;
            const currentSceneImgId = optionId ? `scene_img_${scene.id}_${optionId}` : `scene_img_${scene.id}`;
            
            const availableAssets = assets.filter(a => (scene.assetIds || []).includes(a.id));
            const matched = matchAssetsToPrompt(scene.visual_desc, availableAssets, scene.assetIds || []);
            const top2Ids = matched.slice(0, 2).map(a => a.id);
            const initialVideoIds = [currentSceneImgId, ...top2Ids];
            onUpdate(scene.id, 'videoAssetIds', initialVideoIds);
        }
    };

    // ── @ Mention handlers (from MentionTextarea) ──
    const handleMentionVideo = (assetId: string) => {
        const current = scene.videoAssetIds || [];
        // Allow duplicate mentions — only add to videoAssetIds if not already present (dedup)
        if (!current.includes(assetId)) {
            onUpdate(scene.id, 'videoAssetIds', [...current, assetId]);
        }
    };

    const handleUnmentionVideo = (assetId: string) => {
        const current = scene.videoAssetIds || [];
        onUpdate(scene.id, 'videoAssetIds', current.filter(id => id !== assetId));
    };

    const handleMentionImage = (assetId: string) => {
        const current = scene.assetIds || [];
        if (!current.includes(assetId)) {
            onUpdate(scene.id, 'assetIds', [...current, assetId]);
        }
    };

    const handleUnmentionImage = (assetId: string) => {
        const current = scene.assetIds || [];
        onUpdate(scene.id, 'assetIds', current.filter(id => id !== assetId));
    };

    return {
        // State
        activeAssetSelector, setActiveAssetSelector,
        sceneImages,
        sceneVideos,
        sceneAudios,

        // Handlers
        handleAddAsset,
        handleRemoveAsset,
        handleSpecCommit,
        handleLocalSpecChange,
        initializeVideoAssetIds,
        handleMentionVideo,
        handleUnmentionVideo,
        handleMentionImage,
        handleUnmentionImage,
        handleAssetUpload,
        handleAssetDelete
    };
}
