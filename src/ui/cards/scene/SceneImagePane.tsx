import React, { useState } from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Image as ImageIcon, Loader2, CheckCircle, Camera } from 'lucide-react';
import MentionTextarea, { SceneImageCandidate } from '@/ui/components/MentionTextarea';
import { CameraSelectorModal } from './CameraSelectorModal';

interface SceneImagePaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, fieldOrUpdates: keyof Scene | Partial<Scene>, value?: any) => void;
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
    const [isModalOpen, setIsModalOpen] = useState(false);

    const hasCameraParams = [scene.camera, scene.lens, scene.focal_length, scene.aperture].some(
        val => val && val !== 'None'
    );

    return (
        <div className="flex flex-col h-full divide-y divide-gray-200 dark:divide-white/5 flex-1">
            {/* Top Part: Image Prompt */}
            <div className="p-3 flex flex-col gap-2 relative group flex-1 min-h-0 bg-gray-50 dark:bg-black/10">
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
                    className={`flex-1 w-full bg-white dark:bg-black/20 p-2 rounded border text-xs text-gray-700 dark:text-gray-400 resize-none outline-none min-h-[10rem] transition-all ${
                        isGeneratingPrompts 
                            ? 'border-purple-400 dark:border-purple-500/50 ring-2 ring-purple-400/20 dark:ring-purple-500/20 bg-purple-50/50 dark:bg-purple-900/10' 
                            : 'border-gray-200 dark:border-white/5 focus:border-indigo-500/30 dark:focus:border-banana-500/30'
                    }`}
                />
            </div>

            {/* Bottom Part: Camera Parameters */}
            <div className="bg-gray-100 dark:bg-black/20 p-3 h-[140px] shrink-0 flex flex-col gap-2">
                {/* Top Row: General / Summary (总) */}
                <div className="flex items-center justify-between border-b border-gray-200/40 dark:border-white/5 pb-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cyan-500 font-bold">
                        <Camera className="w-3.5 h-3.5 text-cyan-500" />
                        <span>摄影参数</span>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all border ${
                            hasCameraParams
                                ? 'bg-cyan-500/10 dark:bg-cyan-500/10 hover:bg-cyan-500/20 dark:hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                : 'bg-white dark:bg-black/35 hover:bg-gray-50 dark:hover:bg-black/50 border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-cyan-400'
                        }`}
                    >
                        {hasCameraParams ? '修改参数' : '设定参数'}
                    </button>
                </div>

                {/* Bottom Row: Detailed values (分) */}
                <div className="flex-1 min-h-0 flex flex-col justify-center">
                    {hasCameraParams ? (
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                            <div className="bg-white/40 dark:bg-black/15 px-2 py-1 rounded border border-gray-200/50 dark:border-white/5 flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-tight">机身</span>
                                <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate mt-0.5" title={scene.camera}>
                                    {scene.camera && scene.camera !== 'None' ? scene.camera : '—'}
                                </span>
                            </div>
                            <div className="bg-white/40 dark:bg-black/15 px-2 py-1 rounded border border-gray-200/50 dark:border-white/5 flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-tight">镜头</span>
                                <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate mt-0.5" title={scene.lens}>
                                    {scene.lens && scene.lens !== 'None' ? scene.lens : '—'}
                                </span>
                            </div>
                            <div className="bg-white/40 dark:bg-black/15 px-2 py-1 rounded border border-gray-200/50 dark:border-white/5 flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-tight">焦距</span>
                                <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate mt-0.5">
                                    {scene.focal_length && scene.focal_length !== 'None' ? `${scene.focal_length}mm` : '—'}
                                </span>
                            </div>
                            <div className="bg-white/40 dark:bg-black/15 px-2 py-1 rounded border border-gray-200/50 dark:border-white/5 flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-tight">光圈</span>
                                <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate mt-0.5">
                                    {scene.aperture && scene.aperture !== 'None' ? scene.aperture : '—'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-2 text-center">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                                暂无摄影参数，请点击上方按钮进行设定
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <CameraSelectorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onApply={(camera, lens, focalLength, aperture) => {
                    onUpdate(scene.id, {
                        camera: camera === 'None' ? undefined : camera,
                        lens: lens === 'None' ? undefined : lens,
                        focal_length: focalLength === 'None' ? undefined : focalLength,
                        aperture: aperture === 'None' ? undefined : aperture
                    });
                }}
                initialCamera={scene.camera}
                initialLens={scene.lens}
                initialFocalLength={scene.focal_length}
                initialAperture={scene.aperture}
            />
        </div>
    );
};

export default SceneImagePane;
