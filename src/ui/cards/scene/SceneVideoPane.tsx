import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Video, Clock, Camera, Zap, Plus, X, Image as ImageIcon, Loader2, CheckCircle } from 'lucide-react';
import MentionTextarea, { SceneImageCandidate } from '@/ui/components/MentionTextarea';
import { modelManager, useModelConfig } from '@/services/ai/model-manager';

interface SceneVideoPaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    hasImage: boolean;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'video') => void;
    sceneImages?: SceneImageCandidate[];
    videos?: SceneImageCandidate[];
    audios?: SceneImageCandidate[];
    onMentionAsset: (assetId: string) => void;
    onUnmentionAsset: (assetId: string) => void;
    onAssetUpload?: (type: 'video' | 'audio', file: File) => Promise<string | undefined>;
    onAssetDelete?: (assetId: string) => void;
    isStartEndFrameMode?: boolean;
    startEndAssetIds?: string[];
    onOpenEndFrameSelector: () => void;
    onRemoveEndFrame: () => void;
    isGeneratingPrompts?: boolean;
    isPromptCompleted?: boolean;
}

const SceneVideoPane: React.FC<SceneVideoPaneProps> = ({
    scene,
    labels,
    onUpdate,
    hasImage,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
    sceneImages,
    videos,
    audios,
    onMentionAsset,
    onUnmentionAsset,
    onAssetUpload,
    onAssetDelete,
    isStartEndFrameMode,
    startEndAssetIds,
    onOpenEndFrameSelector,
    onRemoveEndFrame,
    isGeneratingPrompts,
    isPromptCompleted,
}) => {
    // Resolve end frame asset name
    const endFrameId = startEndAssetIds?.[1];
    const endFrameAsset = endFrameId ? assets.find(a => a.id === endFrameId) : null;
    // Also check sceneImages for scene_img_ type IDs
    const endFrameSceneImg = endFrameId && !endFrameAsset ? sceneImages?.find(s => s.id === endFrameId) : null;
    const endFrameName = endFrameAsset?.name || endFrameSceneImg?.name || endFrameId;

    // Filter UI options based on selected model (Seedance vs Veo)
    const config = useModelConfig();
    const modelName = config.t8starVideoModel || "veo";
    const isSeedance = modelName.includes("seedance") || modelName.includes("doubao");

    return (
        <div className="p-3 flex flex-col gap-2 bg-gray-50 dark:bg-black/10 flex-1 min-h-0">
            <div className="flex justify-between items-center">
                <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-bold flex items-center gap-2">
                    <Video className="w-3 h-3" />
                    {labels.videoPromptLabel}
                    {isGeneratingPrompts && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                    {isPromptCompleted && !isGeneratingPrompts && <CheckCircle className="w-3 h-3 text-green-500" />}
                </h4>
            </div>

            {/* Start/End Frame Panel */}
            {isStartEndFrameMode && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden mb-1">
                    {/* START row */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/10">
                        <span className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-bold w-10 shrink-0">START</span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/20">
                            <ImageIcon className="w-3 h-3 text-green-400" />
                            <span className="text-[10px] text-green-300 font-medium">Storyboard Image</span>
                        </div>
                    </div>
                    {/* END row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                        <span className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-bold w-10 shrink-0">END</span>
                        {endFrameId ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20">
                                <ImageIcon className="w-3 h-3 text-blue-400" />
                                <span className="text-[10px] text-blue-300 font-medium">{endFrameName}</span>
                                <button
                                    onClick={onRemoveEndFrame}
                                    className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                    title="Remove End Frame"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={onOpenEndFrameSelector}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-white/15 text-[10px] text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-banana-400 hover:border-indigo-300 dark:hover:border-banana-500/30 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Add End Frame
                            </button>
                        )}
                    </div>
                </div>
            )}



            <MentionTextarea
                value={scene.video_prompt !== undefined ? scene.video_prompt : (scene.visual_desc || '')}
                onChange={(val) => {
                    if (scene.video_prompt !== undefined) {
                        onUpdate(scene.id, 'video_prompt', val);
                    } else {
                        onUpdate(scene.id, 'visual_desc', val);
                    }
                }}
                assets={assets}
                sceneImages={sceneImages}
                videos={videos}
                audios={audios}
                disableVideos={!isSeedance}
                referencedAssetIds={isStartEndFrameMode ? (startEndAssetIds || []) : (scene.videoAssetIds || [])}
                onMention={onMentionAsset}
                onUnmention={onUnmentionAsset}
                onAssetUpload={onAssetUpload}
                onAssetDelete={onAssetDelete}
                maxMentions={isStartEndFrameMode ? undefined : 3}
                mode="video"
                className={`flex-1 w-full p-2 rounded border text-xs resize-none outline-none min-h-[10rem] transition-colors ${
                    isGeneratingPrompts 
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-400 dark:border-blue-500/50 ring-2 ring-blue-400/20 dark:ring-blue-500/20' 
                        : scene.video_prompt 
                            ? 'bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-100 border-green-200 dark:border-green-500/20 focus:border-green-400 dark:focus:border-green-500/40' 
                            : 'bg-white dark:bg-black/20 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/5 focus:border-blue-400 dark:focus:border-blue-500/30'
                    }`}
                placeholder={labels.visualDesc}
            />
        </div >
    );
};

const arraysEqual = (a?: any[], b?: any[]) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const SceneVideoPaneMemo = React.memo(SceneVideoPane, (prev, next) => {
    return prev.labels === next.labels
        && prev.hasImage === next.hasImage
        && prev.isStartEndFrameMode === next.isStartEndFrameMode
        && prev.isGeneratingPrompts === next.isGeneratingPrompts
        && prev.isPromptCompleted === next.isPromptCompleted
        && prev.scene.id === next.scene.id
        && prev.scene.video_prompt === next.scene.video_prompt
        && prev.scene.visual_desc === next.scene.visual_desc
        && arraysEqual(prev.scene.videoAssetIds, next.scene.videoAssetIds)
        && arraysEqual(prev.startEndAssetIds, next.startEndAssetIds)
        && prev.assets === next.assets
        && prev.sceneImages === next.sceneImages
        && prev.videos === next.videos
        && prev.audios === next.audios;
});

export default SceneVideoPaneMemo;
