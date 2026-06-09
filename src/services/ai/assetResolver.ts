import { Scene, Asset } from '@/shared/types';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';
import { loadAssetBase64 } from '@/services/storage';

/**
 * 转换浏览器 blob URL 为 Base64 格式
 */
export const blobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
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
        console.error("[AssetResolver] Failed to convert blob URL to base64", e);
        return null;
    }
};

/** 
 * Unified Dual-Track Asset Extraction Logic
 * Track 1: Strict ID match (scene_img_xxx or scene_video_xxx)
 * Track 2: Smart Name Fallback (E1分镜S03-A or 分镜S03)
 */
export const resolveUsedAssets = async (
    prompt: string, 
    assets: Asset[], 
    allScenes: Scene[],
    scene?: Scene,
    optionId?: string
): Promise<Asset[]> => {
    const tags = extractAssetTags(prompt);
    const usedAssets: Asset[] = [];

    for (const tag of tags) {
        let refUrl: string | undefined;
        let refAssetId: string | undefined;
        let isVideoRef = false;
        let resolved = false;

        // ── 0. Check if it is 首帧 or 尾帧 ──
        if (tag.name === '首帧' || tag.name === '尾帧') {
            const isStart = tag.name === '首帧';
            if (scene && optionId) {
                const canvasData = scene.canvas?.[optionId];
                if (canvasData && canvasData.nodes) {
                    const firstLastFrameNode = canvasData.nodes.find((n: any) => n.type === 'firstLastFrame');
                    if (firstLastFrameNode) {
                        const assetId = isStart ? firstLastFrameNode.data?.startImageAssetId : firstLastFrameNode.data?.endImageAssetId;
                        const imageUrl = isStart ? firstLastFrameNode.data?.startImageUrl : firstLastFrameNode.data?.endImageUrl;
                        if (assetId || imageUrl) {
                            refAssetId = assetId;
                            refUrl = imageUrl;
                            resolved = true;
                        }
                    }
                }
            }
        }

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
                        console.error("[AssetResolver Debug] Failed to unpack normal asset reference from IndexedDB", e);
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
                    console.error("[AssetResolver Debug] Failed to unpack reference Blob from IndexedDB", e);
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
                    console.error("[AssetResolver Debug] Failed to unpack asset from IndexedDB in final check", e);
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
