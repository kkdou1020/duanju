import React, { useState, useEffect } from 'react';
import { Search, Link as LinkIcon, Sparkles, Play, Clapperboard } from 'lucide-react';
import { Scene, GlobalStyle, Asset, NovelChunk } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { AssetSelector } from '@/ui/panels/asset-library/AssetSelector';

import { useSceneCard, UseSceneCardProps } from './useSceneCard';
import SceneHeader from './SceneHeader';
import SceneMediaViewer from './SceneMediaViewer';
import SceneVideoPane from './SceneVideoPane';
import SceneImagePane from './SceneImagePane';
import SceneDialoguePane from './SceneDialoguePane';

interface SceneCardProps {
    scene: Scene;
    characterDesc: string;
    labels: Translation;
    onUpdate: (id: string, fieldOrUpdates: keyof Scene | Partial<Scene> | ((prev: Scene) => Partial<Scene>), value?: any) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    isGeneratingExternal?: boolean;
    isGeneratingPrompts?: boolean;
    isPromptCompleted?: boolean;
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

const SceneCard: React.FC<SceneCardProps> = (props) => {
    const state = useSceneCard(props as UseSceneCardProps);

    const adoptedOption = state.scene.prompt_options?.find(opt => opt.video_prompt === state.scene.video_prompt) 
                          || state.scene.prompt_options?.[0];
    const [viewingOptionId, setViewingOptionId] = useState<string | null>(null);

    useEffect(() => {
        if (!viewingOptionId && adoptedOption) {
            setViewingOptionId(adoptedOption.option_id);
        }
    }, [adoptedOption, viewingOptionId]);

    const viewingOption = state.scene.prompt_options?.find(o => o.option_id === (viewingOptionId || adoptedOption?.option_id));
    const isAdopted = viewingOption?.video_prompt === state.scene.video_prompt;

    const handleSynchronizedUpdate = (id: string, fieldOrUpdates: keyof Scene | Partial<Scene>, value?: any) => {
        const currentOptId = viewingOption?.option_id;

        // Normalize to a Partial<Scene> updates object
        const updates: Partial<Scene> = typeof fieldOrUpdates === 'string'
            ? { [fieldOrUpdates]: value }
            : fieldOrUpdates;

        if (state.scene.prompt_options && currentOptId) {
            const syncedFields = [
                'np_prompt', 'video_prompt', 'imageUrl', 'imageAssetId', 
                'videoUrl', 'videoAssetId', 'assetIds', 'videoAssetIds',
                'camera', 'lens', 'focal_length', 'aperture',
                'textmodel', 'imagemodel', 'videomodel', 
                't8starImageModel', 't8starImageSize', 't8starImageQuality', 
                't8starNanoImageSize', 't8starNanoAspectRatio', 't8starVideoModel'
            ];

            const hasSyncedField = Object.keys(updates).some(k => syncedFields.includes(k));
            if (hasSyncedField) {
                const newOptions = [...state.scene.prompt_options];
                const optionIndex = newOptions.findIndex(o => o.option_id === currentOptId);
                if (optionIndex !== -1) {
                    newOptions[optionIndex] = { ...newOptions[optionIndex] };
                    Object.entries(updates).forEach(([k, v]) => {
                        if (syncedFields.includes(k)) {
                            (newOptions[optionIndex] as any)[k] = v;
                        }
                    });
                    state.onUpdate(id, {
                        ...updates,
                        prompt_options: newOptions
                    });
                    return;
                }
            }
        }
        state.onUpdate(id, updates);
    };

    return (
        <div className={`rounded-xl border overflow-hidden bg-white dark:bg-dark-900 shadow-sm dark:shadow-lg transition-all duration-300 ${state.flash ? 'ring-2 ring-indigo-500 dark:ring-banana-500 animate-pulse' : 'border-gray-200 dark:border-white/5'}`}>
            <div className="flex flex-col md:flex-row">
                {/* LEFT COLUMN: MEDIA */}
                <SceneMediaViewer
                    scene={state.scene}
                    labels={state.labels}
                    onUpdate={handleSynchronizedUpdate}
                    genStatus={state.getGenStatus(viewingOptionId)}
                    videoStatus={state.getVideoStatus(viewingOptionId)}
                    viewMode={state.viewMode}
                    setViewMode={state.setViewMode}
                    hasImage={state.hasImage}
                    hasVideo={state.hasVideo}
                    isGeneratingExternal={state.isGeneratingExternal}
                    areAssetsReady={state.areAssetsReady}
                    videoAssetsReady={state.videoAssetsReady}
                    onGenerateImage={(force) => state.handleGenerateImage(force || false, viewingOptionId || undefined)}
                    onGenerateVideo={() => state.handleGenerateVideo(viewingOptionId || undefined)}
                    onAbort={(type) => state.handleAbortTask(type, viewingOptionId || undefined)}
                    onUploadClick={state.handleUploadClick}
                    onRefresh={() => state.handleRefresh(viewingOptionId || undefined)}
                    onDeleteImage={() => state.handleDeleteImage(viewingOptionId || undefined)}
                    onDeleteVideo={() => state.handleDeleteVideo(viewingOptionId || undefined)}
                    onVideoUploadClick={state.handleVideoUploadClick}
                    onSaveImage={state.saveImage}
                    fileInputRef={state.fileInputRef}
                    onFileChange={state.handleFileChange}
                    videoFileInputRef={state.videoFileInputRef}
                    onVideoFileChange={state.handleVideoFileChange}
                    getTaskStartTime={state.getTaskStartTime}
                    viewingOptionId={viewingOptionId}
                />

                {/* RIGHT COLUMN: CONTENT */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header: Scene ID & Narration */}
                    <SceneHeader
                        scene={state.scene}
                        labels={state.labels}
                        onUpdate={state.onUpdate}
                        onDelete={state.onDelete}
                        onDuplicate={state.onDuplicate}
                        ttsLoading={state.ttsLoading}
                        audioUrl={state.audioUrl}
                        audioRef={state.audioRef}
                        onNarrationTTS={state.handleNarrationTTS}
                        onDownloadAudio={state.handleDownloadAudio}
                    />

                    {/* Prompt Options Selection */}
                    {state.scene.prompt_options && state.scene.prompt_options.length > 0 && (
                        <div className="flex flex-col border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#121212]">
                            {/* Top alignment row with Batch Actions */}
                            <div className="flex justify-end px-3 py-2 bg-gray-100 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-black">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => state.handleGenerateBatchImages()}
                                        disabled={state.getGenStatus(viewingOptionId) === 'GENERATING' || !state.areAssetsReady}
                                        className="px-4 py-1.5 rounded-md border border-purple-300 dark:border-purple-500/50 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold transition-colors disabled:opacity-50"
                                        title={!state.areAssetsReady ? "请等待全局资产准备完成" : "为当前所有方案并发生成对应的分镜图片"}
                                    >
                                        一键生图
                                    </button>
                                    <button
                                        onClick={() => state.handleGenerateBatchVideos()}
                                        disabled={state.getVideoStatus(viewingOptionId) === 'GENERATING' || !state.videoAssetsReady}
                                        className="px-4 py-1.5 rounded-md border border-blue-300 dark:border-blue-500/50 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold transition-colors disabled:opacity-50"
                                        title={!state.videoAssetsReady ? "请等待全局资产准备完成" : "为当前所有方案并发生成对应的视频"}
                                    >
                                        一键生视频
                                    </button>
                                </div>
                            </div>
                            
                            {/* Tabs Row */}
                            <div className="flex border-b border-gray-200 dark:border-black bg-gray-50 dark:bg-[#121212] gap-1 px-2 pt-2">
                                {state.scene.prompt_options.map((opt, index) => {
                                    const isActive = viewingOption?.option_id === opt.option_id;
                                    const displayId = opt.option_id || String.fromCharCode(65 + index);
                                    return (
                                        <button
                                            key={opt.option_id || index}
                                            onClick={() => {
                                                setViewingOptionId(opt.option_id);
                                                // Always Auto-adopt the option's media when clicking its tab
                                                const isAlreadyAdopted = 
                                                    state.scene.video_prompt === opt.video_prompt &&
                                                    state.scene.np_prompt === opt.np_prompt &&
                                                    state.scene.imageUrl === opt.imageUrl &&
                                                    state.scene.imageAssetId === opt.imageAssetId &&
                                                    state.scene.videoUrl === opt.videoUrl &&
                                                    state.scene.videoAssetId === opt.videoAssetId &&
                                                    JSON.stringify(state.scene.assetIds || []) === JSON.stringify(opt.assetIds || []) &&
                                                    JSON.stringify(state.scene.videoAssetIds || []) === JSON.stringify(opt.videoAssetIds || []) &&
                                                    state.scene.camera === opt.camera &&
                                                    state.scene.lens === opt.lens &&
                                                    state.scene.focal_length === opt.focal_length &&
                                                    state.scene.aperture === opt.aperture &&
                                                    state.scene.textmodel === opt.textmodel &&
                                                    state.scene.imagemodel === opt.imagemodel &&
                                                    state.scene.videomodel === opt.videomodel &&
                                                    state.scene.t8starImageModel === opt.t8starImageModel &&
                                                    state.scene.t8starImageSize === opt.t8starImageSize &&
                                                    state.scene.t8starImageQuality === opt.t8starImageQuality &&
                                                    state.scene.t8starNanoImageSize === opt.t8starNanoImageSize &&
                                                    state.scene.t8starNanoAspectRatio === opt.t8starNanoAspectRatio &&
                                                    state.scene.t8starVideoModel === opt.t8starVideoModel;

                                                if (!isAlreadyAdopted) {
                                                    state.onUpdate(state.scene.id, {
                                                        video_prompt: opt.video_prompt,
                                                        np_prompt: opt.np_prompt,
                                                        imageUrl: opt.imageUrl,
                                                        imageAssetId: opt.imageAssetId,
                                                        videoUrl: opt.videoUrl,
                                                        videoAssetId: opt.videoAssetId,
                                                        assetIds: opt.assetIds || [],
                                                        videoAssetIds: opt.videoAssetIds || [],
                                                        camera: opt.camera,
                                                        lens: opt.lens,
                                                        focal_length: opt.focal_length,
                                                        aperture: opt.aperture,
                                                        textmodel: opt.textmodel,
                                                        imagemodel: opt.imagemodel,
                                                        videomodel: opt.videomodel,
                                                        t8starImageModel: opt.t8starImageModel,
                                                        t8starImageSize: opt.t8starImageSize,
                                                        t8starImageQuality: opt.t8starImageQuality,
                                                        t8starNanoImageSize: opt.t8starNanoImageSize,
                                                        t8starNanoAspectRatio: opt.t8starNanoAspectRatio,
                                                        t8starVideoModel: opt.t8starVideoModel
                                                    });
                                                }
                                            }}
                                            className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 rounded-t-md flex justify-center items-center ${isActive ? 'bg-white dark:bg-[#1e1e1e] text-indigo-600 dark:text-yellow-500 border-indigo-600 dark:border-yellow-500 shadow-sm' : 'bg-gray-100 dark:bg-black/40 text-gray-500 border-transparent hover:bg-gray-200 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                        >
                                            方案{displayId}: 实拍参考
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Reference Details Panel */}
                            {viewingOption && (
                                <div className="p-3 flex flex-col gap-3.5 bg-gray-100 dark:bg-[#0a0a0a]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1 shrink-0">
                                            <Search className="w-3 h-3 text-indigo-500 dark:text-blue-400" />
                                            镜头参照:
                                        </span>
                                        <div className="flex-1 bg-white dark:bg-[#151515] border border-indigo-200 dark:border-yellow-500/30 rounded px-2.5 py-1 text-indigo-600 dark:text-yellow-500 text-[11px] font-semibold truncate" title={viewingOption.lens_reference?.shot_name || viewingOption.lens_reference?.searchKeyword || '未知'}>
                                            {viewingOption.lens_reference?.shot_name || viewingOption.lens_reference?.searchKeyword || '未知'}
                                        </div>
                                        {viewingOption.lens_reference?.video_url && (
                                            <a href={viewingOption.lens_reference.video_url} target="_blank" rel="noreferrer" className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold transition-colors">
                                                <LinkIcon className="w-3 h-3" /> 观看原片
                                            </a>
                                        )}
                                    </div>

                                    {/* Description */}
                                    {viewingOption.lens_reference?.description && (
                                        <div className="border-l-2 border-indigo-300 dark:border-yellow-600/50 pl-2 py-0.5 flex flex-wrap gap-1.5 text-[11px] italic text-gray-600 dark:text-gray-400 items-baseline">
                                            <span>{viewingOption.lens_reference.description}</span>
                                            {viewingOption.lens_reference.timestamp && (
                                                <span className="text-gray-500">(参考节点: {viewingOption.lens_reference.timestamp})</span>
                                            )}
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    )}

                    {/* Middle: Split Content (Video/Dialogue Left, Image Right) */}
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-white/5">
                        {/* LEFT PANE: VIDEO PROMPT + DIALOGUE */}
                        <div className="flex flex-col h-full divide-y divide-gray-200 dark:divide-white/5">
                            <SceneVideoPane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={handleSynchronizedUpdate}
                                hasImage={state.hasImage}
                                assets={props.assets || []}
                                chapterScenes={state.chapterScenes}
                                onRemoveAsset={state.handleRemoveAsset}
                                onOpenAssetSelector={() => state.setActiveAssetSelector('video')}
                                sceneImages={state.sceneImages}
                                videos={state.sceneVideos}
                                audios={state.sceneAudios}
                                onMentionAsset={state.handleMentionVideo}
                                onUnmentionAsset={state.handleUnmentionVideo}
                                onAssetUpload={state.handleAssetUpload}
                                onAssetDelete={state.handleAssetDelete}
                                isStartEndFrameMode={state.scene.isStartEndFrameMode}
                                startEndAssetIds={state.scene.startEndAssetIds}
                                onOpenEndFrameSelector={() => state.setActiveAssetSelector('video')}
                                onRemoveEndFrame={() => state.handleRemoveAsset(state.scene.startEndAssetIds?.[1] || '', 'video')}
                                onToggleStartEndMode={(enabled) => state.onUpdate(state.scene.id, 'isStartEndFrameMode', enabled)}
                                isGeneratingPrompts={props.isGeneratingPrompts}
                                isPromptCompleted={props.isPromptCompleted}
                            />

                            <SceneDialoguePane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={handleSynchronizedUpdate}
                            />
                        </div>

                        {/* RIGHT PANE: IMAGE ONLY */}
                        <div className="flex flex-col h-full">
                            <SceneImagePane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={handleSynchronizedUpdate}
                                assets={props.assets || []}
                                chapterScenes={state.chapterScenes}
                                onRemoveAsset={state.handleRemoveAsset}
                                sceneImages={state.sceneImages}
                                videos={state.sceneVideos}
                                audios={state.sceneAudios}
                                onOpenAssetSelector={() => state.setActiveAssetSelector('image')}
                                onMentionAsset={state.handleMentionImage}
                                onUnmentionAsset={state.handleUnmentionImage}
                                onAssetUpload={state.handleAssetUpload}
                                onAssetDelete={state.handleAssetDelete}
                                isGeneratingPrompts={props.isGeneratingPrompts}
                                isPromptCompleted={props.isPromptCompleted}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {state.activeAssetSelector !== 'none' && (
                <AssetSelector
                    assets={state.assets}
                    selectedIds={state.activeAssetSelector === 'video' ? (state.scene.isStartEndFrameMode ? (state.scene.startEndAssetIds || []) : (state.scene.videoAssetIds || [])) : (state.scene.assetIds || [])}
                    onSelect={state.handleAddAsset}
                    onClose={() => state.setActiveAssetSelector('none')}
                    onAssetCreated={state.onAddAsset}
                    maxSelections={state.activeAssetSelector === 'video' && !state.scene.isStartEndFrameMode ? 3 : undefined}
                    extraAssets={state.scene.imageUrl ? [{
                        id: (state.scene.prompt_options && viewingOptionId) ? `scene_img_${state.scene.id}_${viewingOptionId}` : `scene_img_${state.scene.id}`,
                        name: "分镜图",
                        description: "当前分镜已生成的图片 (Current Scene)",
                        type: "item",
                        refImageUrl: state.scene.imageUrl
                    }] : []}
                    sceneImages={state.sceneImages}
                />
            )}
        </div>
    );
};

export default React.memo(SceneCard, (prev, next) => {
    return prev.scene === next.scene
        && prev.isGeneratingExternal === next.isGeneratingExternal
        && prev.isGeneratingPrompts === next.isGeneratingPrompts
        && prev.isPromptCompleted === next.isPromptCompleted
        && prev.areAssetsReady === next.areAssetsReady
        && prev.videoAssetsReady === next.videoAssetsReady
        && prev.flash === next.flash
        && prev.assets === next.assets
        && prev.globalStyle === next.globalStyle
        && prev.language === next.language
        && prev.chunk.assets === next.chunk.assets
        && prev.chapterScenes === next.chapterScenes;
});
