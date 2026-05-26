import React, { useState, useRef, useEffect } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { generateSceneImage, generateSpeech, pcmToWav, generateVideo, pollVideoUntilDone } from '@/services/ai';
import { loadAssetUrl, saveAsset, downloadAndSaveVideo } from '@/services/storage';

export interface UseSceneMediaProps {
    scene: Scene;
    characterDesc: string;
    globalStyle: GlobalStyle;
    assets: Asset[];
    areAssetsReady: boolean;
    language: string;
    chapterScenes?: Scene[];
    onUpdate: (id: string, fieldOrUpdates: keyof Scene | Partial<Scene> | ((prev: Scene) => Partial<Scene>), value?: any) => void;
    onGenerateImageOverride?: (scene: Scene, optionId?: string, signal?: AbortSignal) => Promise<string>;
    onImageGenerated?: (id: string, url: string, imageAssetId?: string, optionId?: string) => void;
    onVideoGenerated?: (id: string, url: string, assetId?: string, optionId?: string, operation?: any) => void;
    checkImageReady?: (optionId?: string) => boolean;
    checkVideoReady?: (optionId?: string) => boolean;
}

export function useSceneMedia(props: UseSceneMediaProps) {
    const {
        scene, characterDesc, globalStyle, assets,
        areAssetsReady, language, chapterScenes, onUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        checkImageReady, checkVideoReady
    } = props;

    const [genStatusMap, setGenStatusMap] = useState<Record<string, ImageGenStatus>>({});
    const [videoStatusMap, setVideoStatusMap] = useState<Record<string, ImageGenStatus>>({});
    const [viewMode, setViewMode] = useState<'image' | 'video'>('image');
    const [ttsLoading, setTtsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(scene.narrationAudioUrl || null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isGeneratingRef = useRef<Set<string>>(new Set());

    const activeAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
    const taskStartTimesRef = useRef<Record<string, number>>({});

    const getTaskStartTime = (type: 'image' | 'video', optionId?: string) => {
        const optionKey = optionId || 'default';
        const taskKey = `${type}_${optionKey}`;
        return taskStartTimesRef.current[taskKey];
    };

    useEffect(() => {
        return () => {
            activeAbortControllersRef.current.forEach(c => c.abort());
            activeAbortControllersRef.current.clear();
        };
    }, []);

    const handleAbortTask = (type: 'image' | 'video', optionId?: string) => {
        const optionKey = optionId || 'default';
        const taskKey = `${type}_${optionKey}`;
        const controller = activeAbortControllersRef.current.get(taskKey);
        if (controller) {
            console.log(`[Abort] Aborting ${type} task for option ${optionKey}...`);
            controller.abort();
            activeAbortControllersRef.current.delete(taskKey);
        }
        
        // Reset status Map
        if (type === 'image') {
            setGenStatusMap(prev => ({ ...prev, [optionKey]: ImageGenStatus.IDLE }));
            isGeneratingRef.current.delete(optionKey);
        } else {
            setVideoStatusMap(prev => ({ ...prev, [optionKey]: ImageGenStatus.IDLE }));
        }
    };

    const getGenStatus = (optionId?: string | null) => genStatusMap[optionId || 'default'] || ImageGenStatus.IDLE;
    const getVideoStatus = (optionId?: string | null) => videoStatusMap[optionId || 'default'] || ImageGenStatus.IDLE;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoFileInputRef = useRef<HTMLInputElement>(null);
    const latestImageRef = useRef<string | null>(scene.imageUrl || null);

    const hasImage = !!scene.imageUrl || !!scene.imageAssetId;
    const hasVideo = scene.isStartEndFrameMode
        ? (!!scene.startEndVideoUrl || !!scene.startEndVideoAssetId)
        : (!!scene.videoUrl || !!scene.videoAssetId);

    // Helper to save Base64 image to IndexedDB and return local URL and asset ID
    const saveBase64Image = async (urlOrBase64: string): Promise<{ localUrl: string; assetId: string }> => {
        if (!urlOrBase64 || !urlOrBase64.startsWith('data:')) {
            return { localUrl: urlOrBase64, assetId: '' };
        }
        try {
            const res = await fetch(urlOrBase64);
            const blob = await res.blob();
            const assetId = await saveAsset(blob);
            const localUrl = URL.createObjectURL(blob);
            return { localUrl, assetId };
        } catch (e) {
            console.error("Failed to save generated image to storage:", e);
            return { localUrl: urlOrBase64, assetId: '' };
        }
    };

    // ── File upload ──
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                const assetId = await saveAsset(file);
                const localUrl = URL.createObjectURL(file);
                latestImageRef.current = localUrl;
                
                const updates: Partial<Scene> = { 
                    imageUrl: localUrl,
                    imageAssetId: assetId
                };
                if (scene.isStartEndFrameMode) {
                    const currentSceneImgId = `scene_img_${scene.id}`;
                    updates.startEndAssetIds = [currentSceneImgId];
                }

                if (scene.prompt_options) {
                    const newOptions = [...scene.prompt_options];
                    const activeOptIdx = newOptions.findIndex((o) => o.video_prompt === scene.video_prompt);
                    if (activeOptIdx !== -1) {
                        newOptions[activeOptIdx] = { 
                            ...newOptions[activeOptIdx], 
                            imageUrl: localUrl,
                            imageAssetId: assetId
                        };
                        updates.prompt_options = newOptions;
                    }
                }

                onUpdate(scene.id, updates);
                setGenStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
            } catch (e) {
                console.error("Failed to save uploaded image file:", e);
                alert("上传图片失败，请重试。");
            }
        }
    };

    // ── Generate Image ──
    const handleGenerateImage = async (force: boolean = false, optionId?: string) => {
        const key = optionId || 'default';
        if (isGeneratingRef.current.has(key)) return;
        if (!areAssetsReady) return;
        if (!force && hasImage) return;

        const taskKey = `image_${key}`;
        if (activeAbortControllersRef.current.has(taskKey)) {
            activeAbortControllersRef.current.get(taskKey)?.abort();
        }
        const controller = new AbortController();
        activeAbortControllersRef.current.set(taskKey, controller);
        taskStartTimesRef.current[taskKey] = Date.now();

        isGeneratingRef.current.add(key);
        setGenStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.GENERATING }));
        try {
            let url = "";
            let imageAssetId: string | undefined;
            if (onGenerateImageOverride) {
                url = await onGenerateImageOverride(scene, optionId, controller.signal);
            } else {
                const result = await generateSceneImage(scene, globalStyle, assets, optionId, chapterScenes, controller.signal);
                url = result.imageUrl || result;
                imageAssetId = result.imageAssetId;
            }

            if (url.startsWith('data:')) {
                const saved = await saveBase64Image(url);
                url = saved.localUrl;
                imageAssetId = saved.assetId;
            }

            setGenStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.COMPLETED }));
            if (onImageGenerated) {
                onImageGenerated(scene.id, url, imageAssetId, optionId);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                console.log(`Image generation aborted for ${key}`);
                return;
            }
            console.error(error);
            setGenStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.ERROR }));
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: `分镜 ${scene.id}${optionId ? ` (方案 ${optionId})` : ''} 生成图片失败: ${error.message || error}`,
                    type: 'warning'
                }
            }));
        } finally {
            isGeneratingRef.current.delete(key);
            activeAbortControllersRef.current.delete(taskKey);
            delete taskStartTimesRef.current[taskKey];
        }
    };

    // ── Batch Generate 3 Images ──
    const handleGenerateBatchImages = async () => {
        if (!areAssetsReady) return;
        if (!scene.prompt_options || scene.prompt_options.length === 0) return;
        
        const updatesMap: Record<string, ImageGenStatus> = {};
        scene.prompt_options.forEach(opt => updatesMap[opt.option_id] = ImageGenStatus.GENERATING);
        setGenStatusMap(prev => ({ ...prev, ...updatesMap }));
        
        try {
            await Promise.all(scene.prompt_options.map(async (opt) => {
                if (checkImageReady && !checkImageReady(opt.option_id)) {
                    setGenStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.IDLE }));
                    return; // Skip if this specific option is not ready
                }
                const taskKey = `image_${opt.option_id}`;
                if (activeAbortControllersRef.current.has(taskKey)) {
                    activeAbortControllersRef.current.get(taskKey)?.abort();
                }
                const controller = new AbortController();
                activeAbortControllersRef.current.set(taskKey, controller);
                taskStartTimesRef.current[taskKey] = Date.now();
                try {
                    const result = await generateSceneImage(scene, globalStyle, assets, opt.option_id, chapterScenes, controller.signal);
                    let url = result.imageUrl || result;
                    let assetId = result.imageAssetId;

                    if (url.startsWith('data:')) {
                        const saved = await saveBase64Image(url);
                        url = saved.localUrl;
                        assetId = saved.assetId;
                    }

                    onUpdate(scene.id, (prevScene) => {
                        const nextOptions = (prevScene.prompt_options || []).map(o => 
                            o.option_id === opt.option_id ? { ...o, imageUrl: url, imageAssetId: assetId } : o
                        );
                        const isCurrentActive = prevScene.video_prompt === opt.video_prompt || (!prevScene.video_prompt && prevScene.prompt_options?.[0]?.option_id === opt.option_id);
                        if (isCurrentActive) {
                            latestImageRef.current = url;
                        }
                        return {
                            prompt_options: nextOptions,
                            ...(isCurrentActive ? { imageUrl: url, imageAssetId: assetId } : {})
                        };
                    });

                    setGenStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.COMPLETED }));
                } catch (e: any) {
                    if (e.name === 'AbortError' || e.message?.includes('aborted')) {
                        console.log(`Batch image generation aborted for ${opt.option_id}`);
                        return;
                    }
                    console.error("Batch image gen failed for option", opt.option_id, e);
                    setGenStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.ERROR }));
                    window.dispatchEvent(new CustomEvent('show-toast', {
                        detail: {
                            message: `分镜 ${scene.id} 方案 ${opt.option_id} 生成图片失败: ${e.message || e}`,
                            type: 'warning'
                        }
                    }));
                } finally {
                    activeAbortControllersRef.current.delete(taskKey);
                    delete taskStartTimesRef.current[taskKey];
                }
            }));
        } catch(e) {
            console.error("Batch image gen failed", e);
        }
    };

    // ── Batch Generate 3 Videos ──
    const handleGenerateBatchVideos = async () => {
        // Technically this should check videoAssetsReady, but we only have areAssetsReady as prop here, which acts as base lock
        if (!areAssetsReady) return;
        if (!scene.prompt_options || scene.prompt_options.length === 0) return;
        
        const updatesMap: Record<string, ImageGenStatus> = {};
        scene.prompt_options.forEach(opt => updatesMap[opt.option_id] = ImageGenStatus.GENERATING);
        setVideoStatusMap(prev => ({ ...prev, ...updatesMap }));
        
        try {
            await Promise.all(scene.prompt_options.map(async (opt) => {
                if (checkVideoReady && !checkVideoReady(opt.option_id)) {
                    setVideoStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.IDLE }));
                    return; // Skip if this specific option is not ready
                }
                const taskKey = `video_${opt.option_id}`;
                if (activeAbortControllersRef.current.has(taskKey)) {
                    activeAbortControllersRef.current.get(taskKey)?.abort();
                }
                const controller = new AbortController();
                activeAbortControllersRef.current.set(taskKey, controller);
                taskStartTimesRef.current[taskKey] = Date.now();
                try {
                    let imageToUse = opt.imageUrl || scene.imageUrl;
                    // Preload asset if possible (simplification: assumes URL is ready if already loaded)
                    const tempScene = { ...scene, video_prompt: opt.video_prompt, np_prompt: opt.np_prompt };
                    
                    const { operation } = await generateVideo(imageToUse || '', tempScene, globalStyle.aspectRatio, assets, globalStyle, chapterScenes, opt.option_id, controller.signal);
                    const { url } = await pollVideoUntilDone(operation, 5000, 180, undefined, controller.signal);
                    const { localUrl, assetId } = await downloadAndSaveVideo(url);

                    onUpdate(scene.id, (prevScene) => {
                        const nextOptions = (prevScene.prompt_options || []).map(o => 
                            o.option_id === opt.option_id ? { ...o, videoUrl: localUrl, videoAssetId: assetId || undefined } : o
                        );
                        const isCurrentActive = prevScene.video_prompt === opt.video_prompt || (!prevScene.video_prompt && prevScene.prompt_options?.[0]?.option_id === opt.option_id);
                        return {
                            prompt_options: nextOptions,
                            ...(isCurrentActive ? { 
                                videoUrl: localUrl, 
                                ...(assetId ? { videoAssetId: assetId } : {})
                            } : {})
                        };
                    });

                    setVideoStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.COMPLETED }));
                } catch (e: any) {
                    if (e.name === 'AbortError' || e.message?.includes('aborted')) {
                        console.log(`Batch video generation aborted for ${opt.option_id}`);
                        return;
                    }
                    console.error("Batch video gen failed for option", opt.option_id, e);
                    setVideoStatusMap(prev => ({ ...prev, [opt.option_id]: ImageGenStatus.ERROR }));
                    window.dispatchEvent(new CustomEvent('show-toast', {
                        detail: {
                            message: `分镜 ${scene.id} 方案 ${opt.option_id} 生成视频失败: ${e.message || e}`,
                            type: 'warning'
                        }
                    }));
                } finally {
                    activeAbortControllersRef.current.delete(taskKey);
                    delete taskStartTimesRef.current[taskKey];
                }
            }));
            
            setViewMode('video');
        } catch(e) {
            console.error("Batch video gen failed", e);
        }
    };

    // ── Generate Video (async submit + poll) ──
    const handleGenerateVideo = async (optionId?: string) => {
        const key = optionId || 'default';
        let imageToUse = latestImageRef.current || scene.imageUrl;
        let assetIdToUse = scene.imageAssetId;

        // If an explicit optionId is provided, prioritize its specific image
        if (optionId && scene.prompt_options) {
            const opt = scene.prompt_options.find(o => o.option_id === optionId);
            if (opt && (opt.imageUrl || opt.imageAssetId)) {
                imageToUse = opt.imageUrl || null;
                assetIdToUse = opt.imageAssetId;
            }
        }

        if (!imageToUse && assetIdToUse) {
            try {
                const loaded = await loadAssetUrl(assetIdToUse);
                if (loaded) imageToUse = loaded;
            } catch (e) {
                console.error("Failed to load image for video gen", e);
            }
        }

        const taskKey = `video_${key}`;
        if (activeAbortControllersRef.current.has(taskKey)) {
            activeAbortControllersRef.current.get(taskKey)?.abort();
        }
        const controller = new AbortController();
        activeAbortControllersRef.current.set(taskKey, controller);
        taskStartTimesRef.current[taskKey] = Date.now();

        // Allow video gen without scene image (reference mode: @图像 tags provide refs)
        setVideoStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.GENERATING }));
        try {
            // Step 1: Submit (returns immediately)
            const { operation } = await generateVideo(imageToUse || '', scene, globalStyle.aspectRatio, assets, globalStyle, chapterScenes, optionId, controller.signal);
            // Step 2: Poll until done
            const { url } = await pollVideoUntilDone(operation, 5000, 180, undefined, controller.signal);
            
            // Step 3: Download and save to IndexedDB to prevent CDN expiration
            const { localUrl, assetId } = await downloadAndSaveVideo(url);

            setVideoStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.COMPLETED }));
            if (onVideoGenerated) {
                onVideoGenerated(scene.id, localUrl, assetId || undefined, optionId, operation);
            }
            // Auto-switch to video view
            setViewMode('video');
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                console.log(`Video generation aborted for ${key}`);
                return;
            }
            console.error(error);
            setVideoStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.ERROR }));
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: `分镜 ${scene.id}${optionId ? ` (方案 ${optionId})` : ''} 生成视频失败: ${error.message || error}`,
                    type: 'warning'
                }
            }));
        } finally {
            activeAbortControllersRef.current.delete(taskKey);
            delete taskStartTimesRef.current[taskKey];
        }
    };

    // ── TTS ──
    const handleNarrationTTS = async () => {
        if (!scene.narration) return;
        setTtsLoading(true);
        try {
            const voiceId = globalStyle.narrationVoice || "Kore";
            const base64Data = await generateSpeech(scene.narration, voiceId);
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
            const reader = new FileReader();
            reader.readAsDataURL(wavBlob);
            reader.onloadend = () => {
                const url = reader.result as string;
                setAudioUrl(url);
                onUpdate(scene.id, 'narrationAudioUrl', url);
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current.src = url;
                        audioRef.current.play();
                    }
                }, 100);
            };
        } catch (e) {
            console.error("Narration TTS Failed", e);
        } finally {
            setTtsLoading(false);
        }
    };

    const handleDownloadAudio = () => {
        if (audioUrl) {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `narration_${scene.id}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // ── Save / Download Image ──
    const saveImage = async () => {
        let imageToSave = latestImageRef.current || scene.imageUrl;
        if (!imageToSave && scene.imageAssetId) {
            try {
                imageToSave = await loadAssetUrl(scene.imageAssetId) || undefined;
            } catch (e) {
                console.error("Failed to load image for save", e);
            }
        }
        if (imageToSave) {
            try {
                let href = imageToSave;
                if (!imageToSave.startsWith('data:')) {
                    const response = await fetch(imageToSave);
                    const blob = await response.blob();
                    href = URL.createObjectURL(blob);
                }
                const link = document.createElement('a');
                link.href = href;
                link.download = `scene_${scene.id}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                if (href !== imageToSave) {
                    URL.revokeObjectURL(href);
                }
            } catch (e) {
                console.error("Failed to download image", e);
                const link = document.createElement('a');
                link.href = imageToSave;
                link.download = `scene_${scene.id}.png`;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleRefresh = (optionId?: string) => {
        if (viewMode === 'video') {
            handleGenerateVideo(optionId);
        } else {
            handleGenerateImage(true, optionId);
        }
    };

    // ── Delete Image ──
    const handleDeleteImage = (optionId?: string) => {
        const key = optionId || 'default';
        latestImageRef.current = null;
        const updates: Partial<Scene> = {
            imageUrl: undefined,
            imageAssetId: undefined
        };

        if (scene.prompt_options) {
            const newOptions = [...scene.prompt_options];
            const activeOptIdx = newOptions.findIndex((o) => o.video_prompt === scene.video_prompt);
            if (activeOptIdx !== -1) {
                newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], imageUrl: undefined, imageAssetId: undefined };
                updates.prompt_options = newOptions;
            }
        }

        onUpdate(scene.id, updates);
        setGenStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.IDLE }));
    };

    // ── Delete Video ──
    const handleDeleteVideo = (optionId?: string) => {
        const key = optionId || 'default';
        const updates: Partial<Scene> = {};
        if (scene.isStartEndFrameMode) {
            updates.startEndVideoUrl = undefined;
            updates.startEndVideoAssetId = undefined;
        } else {
            updates.videoUrl = undefined;
            updates.videoAssetId = undefined;
        }

        if (scene.prompt_options) {
            const newOptions = [...scene.prompt_options];
            const activeOptIdx = newOptions.findIndex((o) => o.video_prompt === scene.video_prompt);
            if (activeOptIdx !== -1) {
                newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], videoUrl: undefined, videoAssetId: undefined };
                updates.prompt_options = newOptions;
            }
        }

        onUpdate(scene.id, updates);
        setVideoStatusMap(prev => ({ ...prev, [key]: ImageGenStatus.IDLE }));
    };

    // ── Upload Video ──
    const handleVideoUploadClick = () => {
        videoFileInputRef.current?.click();
    };

    const handleVideoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.size > 20 * 1024 * 1024) {
                alert('视频文件大小不能超过20MB，请压缩后上传');
                event.target.value = '';
                return;
            }

            setVideoStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.GENERATING }));

            try {
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch('/api/media/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(errText);
                }
                
                const data = await response.json();
                const url = data.url;
                
                if (!url) throw new Error("服务器没有返回有效的 URL");

                const updates: Partial<Scene> = {};
                if (scene.isStartEndFrameMode) {
                    updates.startEndVideoUrl = url;
                } else {
                    updates.videoUrl = url;
                }

                if (scene.prompt_options) {
                    const newOptions = [...scene.prompt_options];
                    const activeOptIdx = newOptions.findIndex((o) => o.video_prompt === scene.video_prompt);
                    if (activeOptIdx !== -1) {
                        newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], videoUrl: url };
                        updates.prompt_options = newOptions;
                    }
                }

                onUpdate(scene.id, updates);
                setVideoStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
                setViewMode('video');
            } catch (e: any) {
                console.error("Failed to upload video:", e);
                alert("上传视频失败: " + e.message);
                setVideoStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.ERROR }));
            }
        }
        event.target.value = '';
    };

    // ── Sync prop image/video url with local status ──
    const syncMediaStatus = () => {
        if (scene.imageUrl) {
            latestImageRef.current = scene.imageUrl;
            setGenStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
        }
        // Check video status based on current mode
        const activeVideoUrl = scene.isStartEndFrameMode ? scene.startEndVideoUrl : scene.videoUrl;
        if (activeVideoUrl) {
            setVideoStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
        }
        if (scene.narrationAudioUrl) setAudioUrl(scene.narrationAudioUrl);
    };

    return {
        // State
        getGenStatus,
        getVideoStatus,
        viewMode, setViewMode,
        ttsLoading,
        audioUrl,
        audioRef,
        videoRef,
        hasImage,
        hasVideo,
        fileInputRef,
        videoFileInputRef,
        latestImageRef,
        getTaskStartTime,

        // Handlers
        handleGenerateImage,
        handleGenerateVideo,
        handleGenerateBatchImages,
        handleGenerateBatchVideos,
        handleAbortTask,
        handleNarrationTTS,
        handleDownloadAudio,
        handleUploadClick,
        handleFileChange,
        handleRefresh,
        handleDeleteImage,
        handleDeleteVideo,
        handleVideoUploadClick,
        handleVideoFileChange,
        saveImage,
        syncMediaStatus,
    };
}
