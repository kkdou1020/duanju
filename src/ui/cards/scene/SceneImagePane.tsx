import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Image as ImageIcon, Loader2, CheckCircle } from 'lucide-react';
import MentionTextarea, { SceneImageCandidate } from '@/ui/components/MentionTextarea';

interface SceneImagePaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'image') => void;
    sceneImages?: SceneImageCandidate[];
    videos?: SceneImageCandidate[];
    audios?: SceneImageCandidate[];
    onMentionAsset: (assetId: string) => void;
    onUnmentionAsset: (assetId: string) => void;
    onAssetUpload?: (type: 'video' | 'audio', file: File) => Promise<string | undefined>;
    onAssetDelete?: (assetId: string) => void;
    isGeneratingPrompts?: boolean;
    isPromptCompleted?: boolean;
}

const SceneImagePane: React.FC<SceneImagePaneProps> = ({
    scene,
    labels,
    onUpdate,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
    onMentionAsset,
    onUnmentionAsset,
    sceneImages,
    videos,
    audios,
    onAssetUpload,
    onAssetDelete,
    isGeneratingPrompts,
    isPromptCompleted
}) => {
    return (
        <div className="p-3 flex flex-col gap-2 relative group flex-1">
            <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold flex justify-between items-center">
                <span className="flex items-center gap-2">
                    <ImageIcon className="w-3 h-3" /> {labels.imagePromptLabel}
                    {isGeneratingPrompts && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                    {isPromptCompleted && !isGeneratingPrompts && <CheckCircle className="w-3 h-3 text-green-500" />}
                </span>
            </h4>



            <MentionTextarea
                value={scene.np_prompt !== undefined ? scene.np_prompt : (scene.visual_desc || '')}
                onChange={(val) => {
                    if (scene.np_prompt !== undefined) {
                        onUpdate(scene.id, 'np_prompt', val);
                    } else {
                        onUpdate(scene.id, 'visual_desc', val);
                    }
                }}
                assets={assets}
                sceneImages={sceneImages}
                videos={videos}
                audios={audios}
                referencedAssetIds={scene.assetIds || []}
                onMention={onMentionAsset}
                onUnmention={onUnmentionAsset}
                onAssetUpload={onAssetUpload}
                onAssetDelete={onAssetDelete}
                mode="image"
                className={`flex-1 w-full bg-white dark:bg-black/20 p-2 rounded border text-xs text-gray-700 dark:text-gray-400 resize-none outline-none min-h-[6rem] transition-all ${
                    isGeneratingPrompts 
                        ? 'border-purple-400 dark:border-purple-500/50 ring-2 ring-purple-400/20 dark:ring-purple-500/20 bg-purple-50/50 dark:bg-purple-900/10' 
                        : 'border-gray-200 dark:border-white/5 focus:border-indigo-500/30 dark:focus:border-banana-500/30'
                }`}
            />
        </div>
    );
};

export default SceneImagePane;
