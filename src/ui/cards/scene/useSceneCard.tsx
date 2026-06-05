import { useState, useEffect, useRef, useMemo } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset, NovelChunk } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { useSceneAssets } from './useSceneAssets';
import { useSceneMedia } from './useSceneMedia';

export interface UseSceneCardProps {
    scene: Scene;
    characterDesc: string;
    labels: Translation;
    onUpdate: (id: string, fieldOrUpdates: keyof Scene | Partial<Scene> | ((prev: Scene) => Partial<Scene>), value?: any) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    isGeneratingExternal?: boolean;
    onGenerateImageOverride?: (scene: Scene, optionId?: string, signal?: AbortSignal) => Promise<string>;
    onImageGenerated?: (id: string, url: string, imageAssetId?: string, optionId?: string) => void;
    onVideoGenerated?: (id: string, url: string, assetId?: string, optionId?: string) => void;
    globalStyle: GlobalStyle;
    areAssetsReady?: boolean;
    videoAssetsReady?: boolean;
    checkImageReady?: (optionId?: string) => boolean;
    checkVideoReady?: (optionId?: string) => boolean;
    assets?: Asset[];
    onAddAsset?: (asset: Asset | Asset[]) => void;
    language?: string;
    isOptimizing?: boolean;
    flash?: boolean;
    chapterScenes?: Scene[];
    chunk: NovelChunk;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => void;
}

export function useSceneCard(props: UseSceneCardProps) {
    const {
        scene, characterDesc, labels, onUpdate,
        onDelete, onDuplicate,
        isGeneratingExternal = false,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        globalStyle,
        areAssetsReady = true,
        videoAssetsReady = true,
        checkImageReady,
        checkVideoReady,
        assets = [],
        onAddAsset,
        language = 'Chinese',
        isOptimizing = false,
        flash = false,
        chapterScenes = [],
        chunk,
        onUpdateChunk
    } = props;

    // ── Option Sync State ──
    const adoptedOption = scene.prompt_options?.find(opt => opt.video_prompt === scene.video_prompt) 
                          || scene.prompt_options?.[0];
    const [viewingOptionId, setViewingOptionId] = useState<string | null>(null);

    useEffect(() => {
        if (!viewingOptionId && adoptedOption) {
            setViewingOptionId(adoptedOption.option_id);
        }
    }, [adoptedOption, viewingOptionId]);

    const viewingOption = scene.prompt_options?.find(o => o.option_id === (viewingOptionId || adoptedOption?.option_id));
    const isAdopted = viewingOption?.video_prompt === scene.video_prompt;

    const handleSynchronizedUpdate = (id: string, fieldOrUpdates: keyof Scene | Partial<Scene> | ((prev: Scene) => Partial<Scene>), value?: any) => {
        const currentOptId = viewingOption?.option_id;

        // Resolve callback or values to Partial<Scene> updates object
        let updates: Partial<Scene>;
        if (typeof fieldOrUpdates === 'function') {
            updates = fieldOrUpdates(scene);
        } else if (typeof fieldOrUpdates === 'string') {
            updates = { [fieldOrUpdates]: value };
        } else {
            updates = fieldOrUpdates;
        }

        // Auto parse asset tags from np_prompt or video_prompt and keep assetIds/videoAssetIds in sync
        const ASSET_TAG_REGEX = /\[@图像_([^#\]]+)(?:#([a-zA-Z0-9_\-]+))?\]/g;
        if ('np_prompt' in updates) {
            const matches = [...(updates.np_prompt || '').matchAll(ASSET_TAG_REGEX)];
            updates.assetIds = matches.map(m => m[2]).filter(Boolean);
        }
        if ('video_prompt' in updates) {
            const matches = [...(updates.video_prompt || '').matchAll(ASSET_TAG_REGEX)];
            updates.videoAssetIds = matches.map(m => m[2]).filter(Boolean);
        }

        if (scene.prompt_options && currentOptId) {
            const syncedFields = [
                'np_prompt', 'video_prompt', 'imageUrl', 'imageAssetId', 
                'videoUrl', 'videoAssetId', 'assetIds', 'videoAssetIds',
                'camera', 'lens', 'focal_length', 'aperture',
                'imageModel', 'imageSize', 'imageQuality', 'videoModel', 'refImageMode'
            ];

            const hasSyncedField = Object.keys(updates).some(k => syncedFields.includes(k));
            if (hasSyncedField) {
                onUpdate(id, (prev) => {
                    const newOptions = prev.prompt_options ? [...prev.prompt_options] : [];
                    const optionIndex = newOptions.findIndex(o => o.option_id === currentOptId);
                    
                    const resolvedUpdates = typeof fieldOrUpdates === 'function' ? fieldOrUpdates(prev) : { ...updates };
                    
                    // Keep assetIds and videoAssetIds synced within the functional update callback
                    if ('np_prompt' in resolvedUpdates) {
                        const matches = [...(resolvedUpdates.np_prompt || '').matchAll(ASSET_TAG_REGEX)];
                        resolvedUpdates.assetIds = matches.map(m => m[2]).filter(Boolean);
                    }
                    if ('video_prompt' in resolvedUpdates) {
                        const matches = [...(resolvedUpdates.video_prompt || '').matchAll(ASSET_TAG_REGEX)];
                        resolvedUpdates.videoAssetIds = matches.map(m => m[2]).filter(Boolean);
                    }

                    if (optionIndex !== -1) {
                        newOptions[optionIndex] = { 
                            ...newOptions[optionIndex]
                        };
                        Object.entries(resolvedUpdates).forEach(([k, v]) => {
                            if (syncedFields.includes(k)) {
                                (newOptions[optionIndex] as any)[k] = v;
                            }
                        });
                    }
                    return {
                        ...resolvedUpdates,
                        prompt_options: newOptions
                    };
                });
                return;
            }
        }
        onUpdate(id, fieldOrUpdates);
    };

    const combinedAssets = useMemo(() => {
        const map = new Map<string, Asset>();
        assets.forEach(a => { if (a && a.id) map.set(a.id, a); });
        (chunk.assets || []).forEach(a => { if (a && a.id) map.set(a.id, a); });
        return Array.from(map.values());
    }, [assets, chunk.assets]);

    // ── Sub-hooks ──
    const assetState = useSceneAssets({
        scene, assets: combinedAssets, globalStyle, language, chapterScenes, chunk, onUpdate: handleSynchronizedUpdate, onUpdateChunk
    });

    const mediaState = useSceneMedia({
        scene, characterDesc, globalStyle, assets: combinedAssets,
        areAssetsReady, language, chapterScenes, onUpdate: handleSynchronizedUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        checkImageReady, checkVideoReady,
        viewingOptionId
    });

    // ── Sync prop image/video url with local status ──
    useEffect(() => {
        mediaState.syncMediaStatus();

        if (scene.imageUrl) {
            if (scene.isStartEndFrameMode) {
                const currentSceneImgId = `scene_img_${scene.id}`;
                const firstId = Array.isArray(scene.startEndAssetIds) && scene.startEndAssetIds.length > 0
                    ? scene.startEndAssetIds[0]
                    : null;
                const alreadySynced = firstId === currentSceneImgId || (firstId && firstId.startsWith(currentSceneImgId + '_'));
                if (!alreadySynced) {
                    handleSynchronizedUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
                }
            } else {
                assetState.initializeVideoAssetIds();
            }
        }
    }, [scene.imageUrl, scene.videoUrl, scene.narrationAudioUrl, scene.isStartEndFrameMode, scene.startEndVideoUrl, scene.startEndVideoAssetId, scene.startEndAssetIds]);

    // ── Reload video element on source change ──
    useEffect(() => {
        if (mediaState.viewMode !== 'video') return;
        if (!scene.videoUrl) return;
        const el = mediaState.videoRef.current;
        if (!el) return;
        try {
            el.pause();
            el.load();
            el.currentTime = 0;
        } catch { }
    }, [scene.videoUrl, mediaState.viewMode]);

    return {
        // Option state and functions
        viewingOptionId,
        setViewingOptionId,
        viewingOption,
        handleSynchronizedUpdate,
        isAdopted,
        adoptedOption,

        // State from media
        getGenStatus: mediaState.getGenStatus,
        getVideoStatus: mediaState.getVideoStatus,
        viewMode: mediaState.viewMode,
        setViewMode: mediaState.setViewMode,
        ttsLoading: mediaState.ttsLoading,
        audioUrl: mediaState.audioUrl,
        audioRef: mediaState.audioRef,
        videoRef: mediaState.videoRef,
        hasImage: mediaState.hasImage,
        hasVideo: mediaState.hasVideo,
        fileInputRef: mediaState.fileInputRef,
        getTaskStartTime: mediaState.getTaskStartTime,

        // State from assets
        activeAssetSelector: assetState.activeAssetSelector,
        setActiveAssetSelector: assetState.setActiveAssetSelector,
        sceneImages: assetState.sceneImages,
        sceneVideos: assetState.sceneVideos,
        sceneAudios: assetState.sceneAudios,

        // Props pass-through
        scene, labels, onUpdate: handleSynchronizedUpdate, rawOnUpdate: onUpdate, onDelete, onDuplicate,
        globalStyle, assets: combinedAssets, onAddAsset, language, chapterScenes,
        flash, isGeneratingExternal, areAssetsReady, videoAssetsReady,

        // Handlers from media
        handleGenerateImage: mediaState.handleGenerateImage,
        handleGenerateVideo: mediaState.handleGenerateVideo,
        handleGenerateBatchImages: mediaState.handleGenerateBatchImages,
        handleGenerateBatchVideos: mediaState.handleGenerateBatchVideos,
        handleAbortTask: mediaState.handleAbortTask,
        handleNarrationTTS: mediaState.handleNarrationTTS,
        handleDownloadAudio: mediaState.handleDownloadAudio,
        handleUploadClick: mediaState.handleUploadClick,
        handleFileChange: mediaState.handleFileChange,
        handleRefresh: mediaState.handleRefresh,
        handleDeleteImage: mediaState.handleDeleteImage,
        handleDeleteVideo: mediaState.handleDeleteVideo,
        handleVideoUploadClick: mediaState.handleVideoUploadClick,
        handleVideoFileChange: mediaState.handleVideoFileChange,
        videoFileInputRef: mediaState.videoFileInputRef,
        saveImage: mediaState.saveImage,

        // Handlers from assets
        handleAddAsset: assetState.handleAddAsset,
        handleRemoveAsset: assetState.handleRemoveAsset,
        handleMentionVideo: assetState.handleMentionVideo,
        handleUnmentionVideo: assetState.handleUnmentionVideo,
        handleMentionImage: assetState.handleMentionImage,
        handleUnmentionImage: assetState.handleUnmentionImage,
        handleAssetUpload: assetState.handleAssetUpload,
        handleAssetDelete: assetState.handleAssetDelete,
    };
}

export type SceneCardState = ReturnType<typeof useSceneCard>;
