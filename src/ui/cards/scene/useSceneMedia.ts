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
    viewingOptionId?: string | null;
}

// Global task registry to keep track of running tasks across component remounts
interface ActiveTask {
    type: 'image' | 'video';
    sceneId: string;
    optionId: string;
    controller: AbortController;
    startTime: number;
    promise: Promise<any>;
}
const globalActiveTasks = new Map<string, ActiveTask>();

type TaskListener = (sceneId: string, optionId: string, type: 'image' | 'video', status: ImageGenStatus, resultUrl?: string) => void;
const taskListeners = new Set<TaskListener>();

function notifyTaskStatus(sceneId: string, optionId: string, type: 'image' | 'video', status: ImageGenStatus, resultUrl?: string) {
    taskListeners.forEach(listener => {
        try {
            listener(sceneId, optionId, type, status, resultUrl);
        } catch (e) {
            console.error("Error in task listener", e);
        }
    });
}

export function useSceneMedia(props: UseSceneMediaProps) {
    const {
        scene, characterDesc, globalStyle, assets,
        areAssetsReady, language, chapterScenes, onUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        checkImageReady, checkVideoReady,
        viewingOptionId
    } = props;

    const [genStatusMap, setGenStatusMap] = useState<Record<string, ImageGenStatus>>({});
    const [videoStatusMap, setVideoStatusMap] = useState<Record<string, ImageGenStatus>>({});
    const [viewMode, setViewMode] = useState<'image' | 'video'>('image');
    const [ttsLoading, setTtsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(scene.narrationAudioUrl || null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isGeneratingRef = useRef<Set<string>>(new Set());

    const getTaskStartTime = (type: 'image' | 'video', optionId?: string) => {
        const optionKey = optionId || 'default';
        const taskKey = `${scene.id}_${optionKey}_${type}`;
        const task = globalActiveTasks.get(taskKey);
        return task ? task.startTime : undefined;
    };

    useEffect(() => {
        const listener: TaskListener = (sceneId, optionId, type, status, resultUrl) => {
            if (sceneId !== scene.id) return;
            
            if (type === 'image') {
                setGenStatusMap(prev => ({ ...prev, [optionId]: status }));
                if (status === ImageGenStatus.GENERATING) {
                    isGeneratingRef.current.add(optionId);
                } else {
                    isGeneratingRef.current.delete(optionId);
                    if (status === ImageGenStatus.COMPLETED && resultUrl) {
                        latestImageRef.current = resultUrl;
                    }
                }
            } else if (type === 'video') {
                setVideoStatusMap(prev => ({ ...prev, [optionId]: status }));
                if (status === ImageGenStatus.COMPLETED) {
                    setViewMode('video');
                }
            }
        };

        taskListeners.add(listener);

        // Sync currently running tasks for this scene on mount or scene change
        globalActiveTasks.forEach(task => {
            if (task.sceneId === scene.id) {
                if (task.type === 'image') {
                    setGenStatusMap(prev => ({ ...prev, [task.optionId]: ImageGenStatus.GENERATING }));
                    isGeneratingRef.current.add(task.optionId);
                } else if (task.type === 'video') {
                    setVideoStatusMap(prev => ({ ...prev, [task.optionId]: ImageGenStatus.GENERATING }));
                }
            }
        });

        return () => {
            taskListeners.delete(listener);
        };
    }, [scene.id]);

    useEffect(() => {
        // Reset maps and states
        setGenStatusMap({});
        setVideoStatusMap({});
        setViewMode('image');
        setTtsLoading(false);
        setAudioUrl(scene.narrationAudioUrl || null);
        
        isGeneratingRef.current.clear();
        latestImageRef.current = scene.imageUrl || null;

        // Sync running tasks for this scene on scene change
        globalActiveTasks.forEach(task => {
            if (task.sceneId === scene.id) {
                if (task.type === 'image') {
                    setGenStatusMap(prev => ({ ...prev, [task.optionId]: ImageGenStatus.GENERATING }));
                    isGeneratingRef.current.add(task.optionId);
                } else if (task.type === 'video') {
                    setVideoStatusMap(prev => ({ ...prev, [task.optionId]: ImageGenStatus.GENERATING }));
                }
            }
        });

        // Immediately sync static media status for the new scene if not generating
        if (scene.imageUrl) {
            const taskKey = `${scene.id}_default_image`;
            if (!globalActiveTasks.has(taskKey)) {
                setGenStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
            }
        }
        const activeVideoUrl = scene.isStartEndFrameMode ? scene.startEndVideoUrl : scene.videoUrl;
        if (activeVideoUrl) {
            const taskKey = `${scene.id}_default_video`;
            if (!globalActiveTasks.has(taskKey)) {
                setVideoStatusMap(prev => ({ ...prev, 'default': ImageGenStatus.COMPLETED }));
            }
        }
    }, [scene.id]);

    const handleAbortTask = (type: 'image' | 'video', optionId?: string) => {
        const optionKey = optionId || 'default';
        const taskKey = `${scene.id}_${optionKey}_${type}`;
        const task = globalActiveTasks.get(taskKey);
        if (task) {
            console.log(`[Abort] Aborting ${type} task for scene ${scene.id} option ${optionKey}...`);
            task.controller.abort();
            globalActiveTasks.delete(taskKey);
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

                const targetOptionId = viewingOptionId || scene.prompt_options?.find(o => o.video_prompt === scene.video_prompt)?.option_id || scene.prompt_options?.[0]?.option_id;
                if (scene.prompt_options && targetOptionId) {
                    const newOptions = [...scene.prompt_options];
                    const activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
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
        if (!areAssetsReady) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "当前分镜引用的资产（角色/场景等）未全部就绪，请先上传参考图",
                    type: 'warning'
                }
            }));
            notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.ERROR);
            return;
        }
        if (!force && hasImage) return;

        const taskKey = `${scene.id}_${key}_image`;
        if (globalActiveTasks.has(taskKey)) return;

        const controller = new AbortController();
        const startTime = Date.now();

        const promise = (async () => {
            notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.GENERATING);
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

                notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.COMPLETED, url);
                if (onImageGenerated) {
                    onImageGenerated(scene.id, url, imageAssetId, optionId);
                }
            } catch (error: any) {
                if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                    console.log(`Image generation aborted for ${key}`);
                    notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.IDLE);
                    return;
                }
                console.error(error);
                notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.ERROR);
                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: {
                        message: `分镜 ${scene.id}${optionId ? ` (方案 ${optionId})` : ''} 生成图片失败: ${error.message || error}`,
                        type: 'warning'
                    }
                }));
            } finally {
                globalActiveTasks.delete(taskKey);
            }
        })();

        globalActiveTasks.set(taskKey, {
            type: 'image',
            sceneId: scene.id,
            optionId: key,
            controller,
            startTime,
            promise
        });
    };

    // ── Batch Generate 3 Images ──
    const handleGenerateBatchImages = async () => {
        if (!areAssetsReady) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "当前分镜引用的资产（角色/场景等）未全部就绪，请先上传参考图",
                    type: 'warning'
                }
            }));
            return;
        }
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
                const key = opt.option_id;
                const taskKey = `${scene.id}_${key}_image`;
                if (globalActiveTasks.has(taskKey)) return;

                const controller = new AbortController();
                const startTime = Date.now();

                const promise = (async () => {
                    notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.GENERATING);
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

                        notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.COMPLETED, url);
                    } catch (e: any) {
                        if (e.name === 'AbortError' || e.message?.includes('aborted')) {
                            console.log(`Batch image generation aborted for ${opt.option_id}`);
                            notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.IDLE);
                            return;
                        }
                        console.error("Batch image gen failed for option", opt.option_id, e);
                        notifyTaskStatus(scene.id, key, 'image', ImageGenStatus.ERROR);
                        window.dispatchEvent(new CustomEvent('show-toast', {
                            detail: {
                                message: `分镜 ${scene.id} 方案 ${opt.option_id} 生成图片失败: ${e.message || e}`,
                                type: 'warning'
                            }
                        }));
                    } finally {
                        globalActiveTasks.delete(taskKey);
                    }
                })();

                globalActiveTasks.set(taskKey, {
                    type: 'image',
                    sceneId: scene.id,
                    optionId: key,
                    controller,
                    startTime,
                    promise
                });
            }));
        } catch(e) {
            console.error("Batch image gen failed", e);
        }
    };

    // ── Batch Generate 3 Videos ──
    const handleGenerateBatchVideos = async () => {
        if (!areAssetsReady) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "当前分镜引用的资产（角色/场景等）未全部就绪，请先上传参考图",
                    type: 'warning'
                }
            }));
            return;
        }
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
                const key = opt.option_id;
                const taskKey = `${scene.id}_${key}_video`;
                if (globalActiveTasks.has(taskKey)) return;

                const controller = new AbortController();
                const startTime = Date.now();

                const promise = (async () => {
                    notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.GENERATING);
                    try {
                        let imageToUse = opt.imageUrl || scene.imageUrl;
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

                        notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.COMPLETED, localUrl);
                    } catch (e: any) {
                        if (e.name === 'AbortError' || e.message?.includes('aborted')) {
                            console.log(`Batch video generation aborted for ${opt.option_id}`);
                            notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.IDLE);
                            return;
                        }
                        console.error("Batch video gen failed for option", opt.option_id, e);
                        notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.ERROR);
                        window.dispatchEvent(new CustomEvent('show-toast', {
                            detail: {
                                message: `分镜 ${scene.id} 方案 ${opt.option_id} 生成视频失败: ${e.message || e}`,
                                type: 'warning'
                            }
                        }));
                    } finally {
                        globalActiveTasks.delete(taskKey);
                    }
                })();

                globalActiveTasks.set(taskKey, {
                    type: 'video',
                    sceneId: scene.id,
                    optionId: key,
                    controller,
                    startTime,
                    promise
                });
            }));
            
            setViewMode('video');
        } catch(e) {
            console.error("Batch video gen failed", e);
        }
    };

    // ── Generate Video (async submit + poll) ──
    const handleGenerateVideo = async (optionId?: string, customPrompt?: string, customBaseImage?: string) => {
        const key = optionId || 'default';
        let imageToUse = customBaseImage !== undefined ? customBaseImage : (latestImageRef.current || scene.imageUrl);
        let assetIdToUse = scene.imageAssetId;

        // If an explicit optionId is provided, prioritize its specific image
        if (customBaseImage === undefined && optionId && scene.prompt_options) {
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

        const taskKey = `${scene.id}_${key}_video`;
        if (globalActiveTasks.has(taskKey)) return;

        const controller = new AbortController();
        const startTime = Date.now();

        const promise = (async () => {
            notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.GENERATING);
            try {
                // Step 1: Submit (returns immediately)
                const { operation } = await generateVideo(imageToUse || '', scene, globalStyle.aspectRatio, assets, globalStyle, chapterScenes, optionId, controller.signal, customPrompt);
                // Step 2: Poll until done
                const { url } = await pollVideoUntilDone(operation, 5000, 180, undefined, controller.signal);
                
                // Step 3: Download and save to IndexedDB to prevent CDN expiration
                const { localUrl, assetId } = await downloadAndSaveVideo(url);

                notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.COMPLETED, localUrl);
                if (onVideoGenerated) {
                    onVideoGenerated(scene.id, localUrl, assetId || undefined, optionId, operation);
                }
                setViewMode('video');
                return { url: localUrl, assetId: assetId || undefined };
            } catch (error: any) {
                if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                    console.log(`Video generation aborted for ${key}`);
                    notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.IDLE);
                    return;
                }
                console.error(error);
                notifyTaskStatus(scene.id, key, 'video', ImageGenStatus.ERROR);
                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: {
                        message: `分镜 ${scene.id}${optionId ? ` (方案 ${optionId})` : ''} 生成视频失败: ${error.message || error}`,
                        type: 'warning'
                    }
                }));
                throw error;
            } finally {
                globalActiveTasks.delete(taskKey);
            }
        })();

        globalActiveTasks.set(taskKey, {
            type: 'video',
            sceneId: scene.id,
            optionId: key,
            controller,
            startTime,
            promise
        });
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

        const targetOptionId = optionId || viewingOptionId || scene.prompt_options?.find(o => o.video_prompt === scene.video_prompt)?.option_id || scene.prompt_options?.[0]?.option_id;
        if (scene.prompt_options && targetOptionId) {
            const newOptions = [...scene.prompt_options];
            const activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
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

        const targetOptionId = optionId || viewingOptionId || scene.prompt_options?.find(o => o.video_prompt === scene.video_prompt)?.option_id || scene.prompt_options?.[0]?.option_id;
        if (scene.prompt_options && targetOptionId) {
            const newOptions = [...scene.prompt_options];
            const activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
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

                const targetOptionId = viewingOptionId || scene.prompt_options?.find(o => o.video_prompt === scene.video_prompt)?.option_id || scene.prompt_options?.[0]?.option_id;
                if (scene.prompt_options && targetOptionId) {
                    const newOptions = [...scene.prompt_options];
                    const activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
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
