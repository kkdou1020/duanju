import React from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { Image as ImageIcon, Aperture, RefreshCw, Download, Video, Film, Upload, Trash2, AlertCircle } from 'lucide-react';
import { refreshVideoUrl } from '@/services/api';
import { downloadAndSaveVideo } from '@/services/storage';

interface SceneMediaViewerProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    genStatus: ImageGenStatus;
    videoStatus: ImageGenStatus;
    viewMode: 'image' | 'video';
    setViewMode: (mode: 'image' | 'video') => void;
    hasImage: boolean;
    hasVideo: boolean;
    isGeneratingExternal: boolean;
    areAssetsReady: boolean;
    videoAssetsReady?: boolean;
    onGenerateImage: (force?: boolean) => void;
    onGenerateVideo: () => void;
    onAbort?: (type: 'image' | 'video') => void;
    onUploadClick: () => void;
    onRefresh: () => void;
    onDeleteImage: () => void;
    onDeleteVideo: () => void;
    onVideoUploadClick: () => void;
    onSaveImage: () => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    videoFileInputRef: React.RefObject<HTMLInputElement | null>;
    onVideoFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    getTaskStartTime?: (type: 'image' | 'video', optionId?: string) => number | undefined;
    viewingOptionId?: string | null;
}

const SceneMediaViewer: React.FC<SceneMediaViewerProps> = ({
    scene, labels, onUpdate,
    genStatus, videoStatus, viewMode, setViewMode,
    hasImage, hasVideo, isGeneratingExternal,
    areAssetsReady, videoAssetsReady = true,
    onGenerateImage, onGenerateVideo, onAbort,
    onUploadClick, onRefresh,
    onDeleteImage, onDeleteVideo, onVideoUploadClick,
    onSaveImage,
    fileInputRef, onFileChange,
    videoFileInputRef, onVideoFileChange,
    getTaskStartTime, viewingOptionId,
}) => {
    const isStartEndMode = !!scene.isStartEndFrameMode;
    const imageStartTime = getTaskStartTime?.('image', viewingOptionId || undefined);
    const videoStartTime = getTaskStartTime?.('video', viewingOptionId || undefined);

    const handleVideoError = async () => {
        const operation = isStartEndMode ? scene.startEndVideoOperation : scene.operation;
        if (!operation) {
            console.warn("No operation cache found on scene for auto re-signature.");
            return;
        }

        try {
            console.log(`[CDN Refresh] Refreshing URL for scene ${scene.id}...`);
            const refreshRes = await refreshVideoUrl(operation);
            if (refreshRes && refreshRes.url) {
                console.log(`[CDN Refresh] Obtained fresh URL, downloading to IndexedDB...`);
                const { localUrl, assetId } = await downloadAndSaveVideo(refreshRes.url);
                if (isStartEndMode) {
                    onUpdate(scene.id, 'startEndVideoUrl', localUrl);
                    if (assetId) onUpdate(scene.id, 'startEndVideoAssetId', assetId);
                } else {
                    onUpdate(scene.id, 'videoUrl', localUrl);
                    if (assetId) onUpdate(scene.id, 'videoAssetId', assetId);
                }
                console.log(`[CDN Refresh] Successfully recovered expired video for scene ${scene.id}`);
            }
        } catch (e) {
            console.error("Auto failover re-signature failed:", e);
        }
    };

    // ── START/END FRAME MODE: keep original behavior ──
    if (isStartEndMode) {
        return (
            <div className="w-full md:w-[320px] bg-gray-100 dark:bg-black/40 min-h-[250px] relative border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/5 flex items-center justify-center group shrink-0">
                <input type="file" ref={fileInputRef} onChange={onFileChange} accept="image/*" className="hidden" />

                {/* Start/End Frame Mode Toggle */}
                {scene.imageUrl && (
                    <div className="absolute top-2 left-2 z-10">
                        <button
                            onClick={() => {
                                onUpdate(scene.id, 'isStartEndFrameMode', false);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm bg-indigo-600 dark:bg-banana-500 text-white dark:text-black shadow-lg shadow-indigo-500/20 dark:shadow-banana-500/20"
                            title="关闭首尾帧模式"
                        >
                            <div className="w-2 h-2 rounded-full bg-white dark:bg-black" />
                            首尾帧模式
                        </button>
                    </div>
                )}

                {hasImage ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-gray-200 dark:bg-black">
                        {viewMode === 'video' && hasVideo ? (
                            <LazyMedia
                                key={scene.startEndVideoUrl || scene.startEndVideoAssetId}
                                assetId={scene.startEndVideoAssetId}
                                fallbackUrl={scene.startEndVideoUrl}
                                type="video" controls
                                className="w-full h-full max-h-[320px]"
                                imgClassName="max-w-full max-h-[320px] object-contain"
                                onError={handleVideoError}
                            />
                        ) : (
                            <LazyMedia
                                assetId={scene.imageAssetId}
                                fallbackUrl={scene.imageUrl}
                                type="image" alt={`Scene ${scene.id}`}
                                className="w-full h-full max-h-[320px] cursor-pointer"
                                imgClassName="max-w-full max-h-[320px] w-auto h-auto object-contain"
                                onClick={onSaveImage}
                            />
                        )}

                        {/* View Toggle (original: only when both exist) */}
                        {hasImage && hasVideo && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex bg-white/90 dark:bg-black/80 rounded-full p-1 border border-gray-200 dark:border-white/10 gap-1 z-20">
                                <button onClick={() => setViewMode('image')} className={`p-1.5 rounded-full transition-all ${viewMode === 'image' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-white'}`}><ImageIcon className="w-3 h-3" /></button>
                                <button onClick={() => setViewMode('video')} className={`p-1.5 rounded-full transition-all ${viewMode === 'video' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-white'}`}><Video className="w-3 h-3" /></button>
                            </div>
                        )}

                        {/* Toolbar */}
                        <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                            <button onClick={onUploadClick} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title={labels.uploadImage || "Upload Image"}><Upload className="w-4 h-4" /></button>
                            <button onClick={onRefresh} className={`p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors ${(genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING) ? 'animate-spin cursor-not-allowed opacity-50' : 'opacity-0 group-hover:opacity-100'}`} disabled={genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING}><RefreshCw className="w-4 h-4" /></button>
                            {!hasVideo && (<button onClick={onGenerateVideo} disabled={videoStatus === ImageGenStatus.GENERATING} className={`p-2 bg-blue-600/80 text-white rounded-full hover:bg-blue-500 transition-colors ${videoStatus === ImageGenStatus.GENERATING ? 'cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`} title={labels.genVideo}>{videoStatus === ImageGenStatus.GENERATING ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Film className="w-4 h-4" />}</button>)}
                            {scene.imageUrl && (<button onClick={onSaveImage} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title={labels.saveImage}><Download className="w-4 h-4" /></button>)}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center w-full">
                        {genStatus === ImageGenStatus.GENERATING || isGeneratingExternal ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-indigo-400 dark:border-banana-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-indigo-500 dark:text-banana-400 font-mono animate-pulse">{labels.rendering}</span>
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-white/5 flex items-center justify-center mb-3"><ImageIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" /></div>
                                {(genStatus === ImageGenStatus.ERROR || videoStatus === ImageGenStatus.ERROR) && (
                                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 dark:border-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold mb-3.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm max-w-[240px]">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500 dark:text-red-400 animate-pulse" />
                                        <span className="leading-snug">
                                            {genStatus === ImageGenStatus.ERROR ? '分镜图生成失败' : '视频生成失败'}，请重试
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onGenerateImage(false)} disabled={!areAssetsReady} className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${areAssetsReady ? 'bg-white dark:bg-white/5 hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black border-gray-300 dark:border-white/10' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-700 cursor-not-allowed'}`}><Aperture className="w-4 h-4" />{labels.visualizeBtn}</button>
                                    <button onClick={onUploadClick} className="p-2 rounded-lg border border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors" title={labels.uploadImage || "Upload Image"}><Upload className="w-4 h-4" /></button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Progress overlays */}
                {(genStatus === ImageGenStatus.GENERATING || isGeneratingExternal) && (
                    <ProgressOverlay type="image" startTime={imageStartTime} onAbort={() => onAbort?.('image')} />
                )}
                {videoStatus === ImageGenStatus.GENERATING && (
                    <ProgressOverlay type="video" startTime={videoStartTime} onAbort={() => onAbort?.('video')} />
                )}
            </div>
        );
    }

    // ── REFERENCE MODE: Dual Tab Layout ──
    return (
        <div className="w-full md:w-[320px] bg-gray-100 dark:bg-black/40 min-h-[250px] relative border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/5 flex flex-col items-center justify-center group shrink-0">
            <input type="file" ref={fileInputRef} onChange={onFileChange} accept="image/*" className="hidden" />
            <input type="file" ref={videoFileInputRef} onChange={onVideoFileChange} accept="video/*" className="hidden" />

            {/* Start/End Frame Mode Toggle (show when image exists) */}
            {scene.imageUrl && (
                <div className="absolute top-2 left-2 z-10">
                    <button
                        onClick={() => {
                            onUpdate(scene.id, 'isStartEndFrameMode', true);
                            const startId = `scene_img_${scene.id}`;
                            if (!scene.startEndAssetIds || scene.startEndAssetIds.length === 0) {
                                onUpdate(scene.id, 'startEndAssetIds', [startId]);
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm bg-white/80 dark:bg-black/60 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-black/80 border border-gray-300 dark:border-white/10"
                        title="开启首尾帧模式 (强制使用 veo3.1-pro-4k)"
                    >
                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                        首尾帧模式
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 w-full flex items-center justify-center">
                {viewMode === 'image' ? (
                    /* ── IMAGE TAB ── */
                    hasImage ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-gray-200 dark:bg-black">
                            <LazyMedia
                                assetId={scene.imageAssetId}
                                fallbackUrl={scene.imageUrl}
                                type="image" alt={`Scene ${scene.id}`}
                                className="w-full h-full max-h-[320px] cursor-pointer"
                                imgClassName="max-w-full max-h-[320px] w-auto h-auto object-contain"
                                onClick={onSaveImage}
                            />
                            {/* Image Toolbar */}
                            <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                                <button onClick={onUploadClick} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title={labels.uploadImage || "Upload"}><Upload className="w-4 h-4" /></button>
                                <button onClick={() => onGenerateImage(true)} className={`p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors ${genStatus === ImageGenStatus.GENERATING ? 'animate-spin cursor-not-allowed opacity-50' : 'opacity-0 group-hover:opacity-100'}`} disabled={genStatus === ImageGenStatus.GENERATING || !areAssetsReady} title={labels.regenerate}><RefreshCw className="w-4 h-4" /></button>
                                <button onClick={onSaveImage} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title={labels.saveImage}><Download className="w-4 h-4" /></button>
                                <button onClick={onDeleteImage} className="p-2 bg-white/90 dark:bg-black/60 text-red-500 dark:text-red-400 rounded-full hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100" title="删除图片"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center w-full">
                            {genStatus === ImageGenStatus.GENERATING || isGeneratingExternal ? (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-2 border-indigo-400 dark:border-banana-400 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs text-indigo-500 dark:text-banana-400 font-mono animate-pulse">{labels.rendering}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-white/5 flex items-center justify-center mb-3"><ImageIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" /></div>
                                    {genStatus === ImageGenStatus.ERROR && (
                                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 dark:border-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold mb-3.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm max-w-[240px]">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500 dark:text-red-400 animate-pulse" />
                                            <span className="leading-snug">分镜图片生成失败，请重试</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className="relative group/btn">
                                            <button
                                                onClick={() => onGenerateImage(false)}
                                                disabled={!areAssetsReady}
                                                className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${areAssetsReady
                                                    ? 'bg-white dark:bg-white/5 hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black border-gray-300 dark:border-white/10'
                                                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-700 cursor-not-allowed'
                                                    }`}
                                            >
                                                <Aperture className="w-4 h-4" />
                                                {labels.visualizeBtn}
                                            </button>
                                            {!areAssetsReady && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover/btn:block z-50 text-center">
                                                    {!scene.np_prompt?.trim() ? '请先生成提示词' : '请先生成资产参考图'}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={onUploadClick} className="p-2 rounded-lg border border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors" title={labels.uploadImage || "Upload Image"}><Upload className="w-4 h-4" /></button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                ) : (
                    /* ── VIDEO TAB ── */
                    hasVideo ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-gray-200 dark:bg-black">
                            <LazyMedia
                                key={scene.videoUrl || scene.videoAssetId}
                                assetId={scene.videoAssetId}
                                fallbackUrl={scene.videoUrl}
                                type="video" controls
                                className="w-full h-full max-h-[320px]"
                                imgClassName="max-w-full max-h-[320px] object-contain"
                                onError={handleVideoError}
                            />
                            {/* Video Toolbar */}
                            <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                                <button onClick={onVideoUploadClick} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title="上传视频"><Upload className="w-4 h-4" /></button>
                                <button onClick={onGenerateVideo} className={`p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors ${videoStatus === ImageGenStatus.GENERATING ? 'animate-spin cursor-not-allowed opacity-50' : 'opacity-0 group-hover:opacity-100'}`} disabled={videoStatus === ImageGenStatus.GENERATING || !videoAssetsReady} title="重新生成视频"><RefreshCw className="w-4 h-4" /></button>
                                <button onClick={onSaveImage} className="p-2 bg-white/90 dark:bg-black/60 text-gray-700 dark:text-white rounded-full hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black transition-colors opacity-0 group-hover:opacity-100" title="下载视频"><Download className="w-4 h-4" /></button>
                                <button onClick={onDeleteVideo} className="p-2 bg-white/90 dark:bg-black/60 text-red-500 dark:text-red-400 rounded-full hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100" title="删除视频"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center w-full">
                            {videoStatus === ImageGenStatus.GENERATING ? (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-2 border-indigo-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs text-indigo-600 dark:text-blue-400 font-mono animate-pulse">生成视频...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-white/5 flex items-center justify-center mb-3"><Film className="w-6 h-6 text-gray-400 dark:text-gray-500" /></div>
                                    {videoStatus === ImageGenStatus.ERROR && (
                                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 dark:border-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold mb-3.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm max-w-[240px]">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500 dark:text-red-400 animate-pulse" />
                                            <span className="leading-snug">视频生成失败，请重试</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className="relative group/btn">
                                            <button
                                                onClick={onGenerateVideo}
                                                disabled={!videoAssetsReady}
                                                className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${videoAssetsReady
                                                    ? 'bg-white dark:bg-white/5 hover:bg-blue-600 dark:hover:bg-blue-500 hover:text-white border-gray-300 dark:border-white/10'
                                                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-700 cursor-not-allowed'
                                                    }`}
                                            >
                                                <Film className="w-4 h-4" />
                                                生成视频
                                            </button>
                                            {!videoAssetsReady && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover/btn:block z-50 text-center">
                                                    {!scene.video_prompt?.trim() ? '请先生成提示词' : '请先生成引用的资产/分镜图，或参考图不能超过3个'}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={onVideoUploadClick} className="p-2 rounded-lg border border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors" title="上传视频"><Upload className="w-4 h-4" /></button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* ── Bottom Tab Toggle (always visible in reference mode) ── */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex bg-white/90 dark:bg-black/80 rounded-full p-1 border border-gray-200 dark:border-white/10 gap-1 z-20">
                <button
                    onClick={() => setViewMode('image')}
                    className={`p-1.5 rounded-full transition-all ${viewMode === 'image' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-white'}`}
                    title="图片"
                >
                    <ImageIcon className="w-3 h-3" />
                </button>
                <button
                    onClick={() => setViewMode('video')}
                    className={`p-1.5 rounded-full transition-all ${viewMode === 'video' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-white'}`}
                    title="视频"
                >
                    <Video className="w-3 h-3" />
                </button>
            </div>

            {/* Progress overlays */}
            {(genStatus === ImageGenStatus.GENERATING || isGeneratingExternal) && (
                <ProgressOverlay type="image" startTime={imageStartTime} onAbort={() => onAbort?.('image')} />
            )}
            {videoStatus === ImageGenStatus.GENERATING && (
                <ProgressOverlay type="video" startTime={videoStartTime} onAbort={() => onAbort?.('video')} />
            )}
        </div>
    );
};

/* ── PROGRESS BAR SCHEME A OVERLAY ── */
interface ProgressOverlayProps {
    type: 'image' | 'video';
    startTime?: number;
    onAbort?: () => void;
}

const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ type, startTime, onAbort }) => {
    const getElapsed = React.useCallback(() => {
        if (!startTime) return 0;
        return Math.max(0, Math.round((Date.now() - startTime) / 1000));
    }, [startTime]);

    const [elapsed, setElapsed] = React.useState(getElapsed);
    const estimated = type === 'image' ? 60 : 90;

    React.useEffect(() => {
        setElapsed(getElapsed());
        const interval = setInterval(() => {
            setElapsed(getElapsed());
        }, 200);
        return () => clearInterval(interval);
    }, [getElapsed]);

    // Compute progress percentage with organic time-decay curve
    let progress = 0;
    if (type === 'image') {
        progress = Math.min(90, Math.round((elapsed / estimated) * 100));
    } else {
        if (elapsed < 25) {
            progress = Math.round((elapsed / 25) * 50);
        } else if (elapsed < 55) {
            progress = Math.round(50 + ((elapsed - 25) / 30) * 35);
        } else {
            // Asymptotically approach 95%
            const extra = 1 - Math.exp(-(elapsed - 55) / 15);
            progress = Math.round(85 + extra * 10);
        }
    }

    return (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 transition-all duration-300">
            <div className="bg-white/10 dark:bg-black/40 border border-white/20 dark:border-white/10 rounded-2xl p-5 max-w-[260px] w-full flex flex-col items-center gap-4 shadow-2xl backdrop-blur-lg">
                {/* Micro-animation Loader Icon */}
                <div className="relative flex items-center justify-center">
                    <div className="absolute w-12 h-12 border-2 border-indigo-500/30 dark:border-banana-500/30 rounded-full animate-ping" />
                    <div className="w-10 h-10 border-2 border-t-indigo-500 dark:border-t-banana-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                    {type === 'image' ? (
                        <ImageIcon className="w-5 h-5 text-indigo-500 dark:text-banana-400 absolute" />
                    ) : (
                        <Film className="w-5 h-5 text-indigo-500 dark:text-banana-400 absolute animate-pulse" />
                    )}
                </div>

                {/* Progress Details */}
                <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-white tracking-wide">
                        {type === 'image' ? '正在渲染分镜图...' : '正在生成电影视频...'}
                    </p>
                    <p className="text-[10px] text-gray-300 font-mono">
                        已耗时: {elapsed}s / 预估 {estimated}s
                    </p>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-banana-400 dark:via-yellow-400 dark:to-orange-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Percent Indicator */}
                <span className="text-[10px] font-bold text-white bg-indigo-600/30 dark:bg-banana-500/20 px-2 py-0.5 rounded-full border border-indigo-500/20 dark:border-banana-500/20">
                    进度: {progress}%
                </span>

                {/* Optional Abort Button */}
                {onAbort && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAbort();
                        }}
                        className="mt-1 px-3.5 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all"
                    >
                        取消生成
                    </button>
                )}
            </div>
        </div>
    );
};

const SceneMediaViewerMemo = React.memo(SceneMediaViewer, (prev, next) => {
    return prev.labels === next.labels
        && prev.genStatus === next.genStatus
        && prev.videoStatus === next.videoStatus
        && prev.viewMode === next.viewMode
        && prev.hasImage === next.hasImage
        && prev.hasVideo === next.hasVideo
        && prev.isGeneratingExternal === next.isGeneratingExternal
        && prev.areAssetsReady === next.areAssetsReady
        && prev.videoAssetsReady === next.videoAssetsReady
        && prev.viewingOptionId === next.viewingOptionId
        && prev.scene.id === next.scene.id
        && prev.scene.imageUrl === next.scene.imageUrl
        && prev.scene.imageAssetId === next.scene.imageAssetId
        && prev.scene.videoUrl === next.scene.videoUrl
        && prev.scene.videoAssetId === next.scene.videoAssetId
        && prev.scene.startEndVideoUrl === next.scene.startEndVideoUrl
        && prev.scene.startEndVideoAssetId === next.scene.startEndVideoAssetId
        && prev.scene.isStartEndFrameMode === next.scene.isStartEndFrameMode
        && prev.scene.operation === next.scene.operation
        && prev.scene.startEndVideoOperation === next.scene.startEndVideoOperation;
});

export default SceneMediaViewerMemo;
