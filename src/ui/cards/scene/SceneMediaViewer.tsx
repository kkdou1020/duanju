import React from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { Image as ImageIcon, Aperture, RefreshCw, Download, Video, Film, Upload, Trash2 } from 'lucide-react';
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
}

const SceneMediaViewer: React.FC<SceneMediaViewerProps> = ({
    scene, labels, onUpdate,
    genStatus, videoStatus, viewMode, setViewMode,
    hasImage, hasVideo, isGeneratingExternal,
    areAssetsReady, videoAssetsReady = true,
    onGenerateImage, onGenerateVideo,
    onUploadClick, onRefresh,
    onDeleteImage, onDeleteVideo, onVideoUploadClick,
    onSaveImage,
    fileInputRef, onFileChange,
    videoFileInputRef, onVideoFileChange,
}) => {
    const isStartEndMode = !!scene.isStartEndFrameMode;

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
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onGenerateImage(false)} disabled={!areAssetsReady} className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${areAssetsReady ? 'bg-white dark:bg-white/5 hover:bg-indigo-600 dark:hover:bg-banana-500 hover:text-white dark:hover:text-black border-gray-300 dark:border-white/10' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-700 cursor-not-allowed'}`}><Aperture className="w-4 h-4" />{labels.visualizeBtn}</button>
                                    <button onClick={onUploadClick} className="p-2 rounded-lg border border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors" title={labels.uploadImage || "Upload Image"}><Upload className="w-4 h-4" /></button>
                                </div>
                            </>
                        )}
                    </div>
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
        </div>
    );
};

export default SceneMediaViewer;
