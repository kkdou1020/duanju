import { useEffect, useRef, useMemo } from 'react';
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

    // ── Sub-hooks ──
    const assetState = useSceneAssets({
        scene, assets, globalStyle, language, chapterScenes, chunk, onUpdate, onUpdateChunk
    });

    const combinedAssets = useMemo(() => {
        return [...assets, ...(chunk.assets || [])];
    }, [assets, chunk.assets]);

    const mediaState = useSceneMedia({
        scene, characterDesc, globalStyle, assets: combinedAssets,
        areAssetsReady, language, chapterScenes, onUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        checkImageReady, checkVideoReady
    });

    // ── Sync prop image/video url with local status ──
    useEffect(() => {
        mediaState.syncMediaStatus();

        if (scene.imageUrl) {
            if (scene.isStartEndFrameMode) {
                const currentSceneImgId = `scene_img_${scene.id}`;
                const alreadySynced = Array.isArray(scene.startEndAssetIds) &&
                    scene.startEndAssetIds.length === 1 &&
                    scene.startEndAssetIds[0] === currentSceneImgId;
                if (!alreadySynced) {
                    onUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
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
        scene, labels, onUpdate, onDelete, onDuplicate,
        globalStyle, assets, onAddAsset, language, chapterScenes,
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
