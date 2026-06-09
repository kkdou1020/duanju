import React, { useEffect, useState } from 'react';
import { NovelChunk, Asset, GlobalStyle, Scene, ImageGenStatus } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { ChevronDown, ChevronRight, Wand2, FileText, Video, Download, CheckCircle, Loader2, Film, AlertTriangle, AlertCircle, Trash2, Copy, X, Save, Layers } from 'lucide-react';
import SceneCard from '@/ui/cards/scene/SceneCard';
import { SceneCanvasModal } from '@/ui/cards/scene/canvas/SceneCanvasModal';
import { useChunkActions } from './useChunkActions';
import { useSceneMedia } from '@/ui/cards/scene/useSceneMedia';
import { saveAsset } from '@/services/storage';

interface ChunkPanelProps {
    chunk: NovelChunk;
    allChunks: NovelChunk[];
    globalAssets: Asset[];
    styleState: GlobalStyle;
    labels: Translation;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => void;
    onDeleteChunk: (id: string) => void;
    onCopyChunk: (id: string) => void;
    onSceneUpdate: (chunkId: string, sceneId: string, updates: Partial<Scene> | ((prevScene: Scene) => Partial<Scene>)) => void;
    onDuplicateScene: (chunkId: string, sceneId: string) => void;
    onExtract: (chunk: NovelChunk) => Promise<Asset[]>;
    onGenerateScript: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateBeats: (chunk: NovelChunk) => Promise<Scene[]>;
    onGeneratePrompts: (chunk: NovelChunk, targetSceneIds?: string[]) => Promise<Scene[]>;
    onGenerateImage: (scene: Scene, chunkAssets?: Asset[], optionId?: string, allScenes?: Scene[]) => Promise<string>;
    language: string;
    isActive: boolean;
    onToggle: () => void;
    flashSceneId?: string;
    fullNovelText?: string;
    filename?: string;
    onAddAsset?: (asset: Asset) => void;
}

const ChunkPanel: React.FC<ChunkPanelProps> = ({
    chunk, allChunks, globalAssets, styleState, labels,
    onUpdateChunk, onDeleteChunk, onCopyChunk, onSceneUpdate, onDuplicateScene,
    onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage,
    language, isActive, onToggle,
    flashSceneId,
    fullNovelText = "",
    filename = "",
    onAddAsset
}) => {
    const {
        loadingStep, scriptError, exportProgress,
        generatingSceneIds, activePromptSceneId, completedPromptSceneIds, getSceneAssetsReady, getVideoAssetsReady, anyAssetPending,
        showTextModal, setShowTextModal, editingText, setEditingText,
        handleAddChunkAssets, handleExtract, handleScript,
        handleStoryboard, handleGeneratePromptsAction,
        handleDeleteScene, handleDuplicateScene,
        handleShoot, handleMakeFilm,
        handleSceneUpdateWrapper, handleImageGenerated,
        handleGenerateImageInternal, handleVideoGenerated,
        handleDownload,
    } = useChunkActions({
        chunk, allChunks, styleState, language, isActive,
        onUpdateChunk, onSceneUpdate, onDuplicateScene,
        onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage, onToggle,
        fullNovelText,
        filename
    });

    const [activeCanvasSceneId, setActiveCanvasSceneId] = useState<string | null>(null);
    const [activeCanvasOptionId, setActiveCanvasOptionId] = useState<string | undefined>(undefined);
    const activeCanvasScene = chunk.scenes.find(s => s.id === activeCanvasSceneId);

    const handleAddScene = () => {
        let nextSceneId = '';
        onUpdateChunk(chunk.id, (prev) => {
            const currentScenes = prev.scenes || [];
            let nextIndex = 1;
            if (currentScenes.length > 0) {
                const indices = currentScenes.map(s => {
                    const match = s.id.match(/\d+/);
                    return match ? parseInt(match[0], 10) : 0;
                });
                nextIndex = Math.max(...indices) + 1;
            }
            nextSceneId = `scene_${nextIndex}`;
            
            const newScene: Scene = {
                id: nextSceneId,
                narration: '',
                visual_desc: '',
                np_prompt: '',
                video_prompt: '',
                assetIds: [],
                videoAssetIds: [],
                camera: 'None',
                lens: 'None',
                focal_length: 'None',
                aperture: 'None',
                prompt_options: [
                    {
                        option_id: 'A',
                        lens_reference: { shot_name: '', description: '', searchKeyword: '', video_url: '', timestamp: '' },
                        np_prompt: '',
                        video_prompt: '',
                    },
                    {
                        option_id: 'B',
                        lens_reference: { shot_name: '', description: '', searchKeyword: '', video_url: '', timestamp: '' },
                        np_prompt: '',
                        video_prompt: '',
                    },
                    {
                        option_id: 'C',
                        lens_reference: { shot_name: '', description: '', searchKeyword: '', video_url: '', timestamp: '' },
                        np_prompt: '',
                        video_prompt: '',
                    }
                ]
            };
            return {
                scenes: [...currentScenes, newScene]
            };
        });

        if (nextSceneId) {
            setActiveCanvasSceneId(nextSceneId);
        }
    };

    return (
        <>
            <div className={`bg-white dark:bg-dark-800 rounded-xl border overflow-hidden shadow-md dark:shadow-lg transition-all duration-300 ease-in-out w-[75%] ${isActive ? 'border-indigo-500/30 dark:border-banana-500/30 ring-1 ring-indigo-500/20 dark:ring-banana-500/20' : 'border-gray-200 dark:border-white/10'}`}>

                {/* Header */}
                <div className="p-4 flex items-center justify-between bg-gray-50 dark:bg-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10" onClick={onToggle}>
                    <div className="flex items-center gap-4">
                        <button className="text-gray-400 dark:text-gray-500">
                            {isActive ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </button>
                        <div className="flex-1" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={chunk.title || `${labels.chunkLabel} ${chunk.index + 1}`}
                                    onChange={(e) => onUpdateChunk(chunk.id, { title: e.target.value })}
                                    className="bg-transparent text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 dark:focus:ring-banana-500/50 rounded px-1 -ml-1 hover:bg-gray-200 dark:hover:bg-white/5 transition-colors w-full"
                                />
                            </div>
                            <p
                                className="text-xs text-gray-500 font-mono mt-1 cursor-pointer hover:text-indigo-600 dark:hover:text-banana-400 transition-colors flex items-center gap-1 group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingText(chunk.text);
                                    setShowTextModal(true);
                                }}
                                title="点击查看完整内容"
                            >
                                <span className="group-hover:underline decoration-indigo-400/50 dark:decoration-banana-400/50 underline-offset-2">{chunk.text.substring(0, 60)}...</span>
                                <FileText className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 dark:text-banana-400" />
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onCopyChunk(chunk.id); }}
                            className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors"
                            title={language === 'Chinese' ? '复制章节' : 'Copy Chapter'}
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                            disabled={exportProgress !== null}
                            className="p-1.5 text-gray-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors"
                            title={language === 'Chinese' ? '下载资产包 (ZIP)' : 'Download ZIP'}
                        >
                            {exportProgress !== null ? (
                                <div className="w-4 h-4 border-2 border-gray-400 dark:border-white/50 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteChunk(chunk.id); }}
                            className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors"
                            title={labels.btnDelete}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Asset Status Indicator */}
                        {anyAssetPending && (
                            <div className="text-yellow-500 text-xs flex items-center gap-1" title="Please generate asset images in the Assets tab first">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Assets Pending</span>
                            </div>
                        )}

                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${chunk.status === 'completed' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30' :
                            chunk.status === 'shooting' ? 'bg-indigo-100 dark:bg-banana-500/20 text-indigo-700 dark:text-banana-400 border border-indigo-200 dark:border-banana-500/30 animate-pulse' :
                                chunk.status === 'storyboarded' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30' :
                                    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>
                            {chunk.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                            {chunk.status}
                        </div>
                    </div>
                </div>

                {/* Workflow Toolbar */}
                <div className="border-t border-gray-200 dark:border-white/10 p-2 bg-white dark:bg-black/20 flex flex-wrap gap-2 justify-end items-center">

                    {scriptError && (
                        <div className="mr-auto text-red-400 text-xs flex items-center gap-2 px-2">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {scriptError}
                        </div>
                    )}

                    <div className="group relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleStoryboard(); }}
                            disabled={loadingStep !== 'none'}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${loadingStep === 'none'
                                ? 'bg-purple-100 dark:bg-purple-500/20 hover:bg-purple-200 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-400'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {loadingStep === 'storyboarding' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            {labels.btnStoryboard || (language === 'Chinese' ? '生成分镜' : 'Storyboard')}
                        </button>
                    </div>

                    <div className="group relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleGeneratePromptsAction(); }}
                            disabled={loadingStep !== 'none' || chunk.scenes.length === 0}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${loadingStep === 'none' && chunk.scenes.length > 0
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {loadingStep === 'scripting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {labels.btnGeneratePrompts || (language === 'Chinese' ? '生成提示词' : 'Gen Prompts')}
                        </button>
                        {chunk.scenes.length === 0 && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                                {language === 'English' ? 'Generate Storyboard first' : '请先生成分镜'}
                            </div>
                        )}
                    </div>

                    <div className="group relative">
                        {(() => {
                            const allReady = chunk.scenes.length > 0 && chunk.scenes.every(s => getSceneAssetsReady(s));
                            const hasNoPrompts = chunk.scenes.length > 0 && chunk.scenes.some(s => !s.np_prompt?.trim());
                            return (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleShoot(); }}
                                        disabled={!allReady}
                                        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 shadow-lg ${allReady
                                            ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black hover:bg-indigo-700 dark:hover:bg-banana-400 shadow-indigo-500/20 dark:shadow-banana-500/20'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        <Video className="w-4 h-4" />
                                        {labels.btnShoot}
                                    </button>
                                    {!allReady && chunk.scenes.length > 0 && (
                                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                                            {hasNoPrompts
                                                ? (language === 'English' ? 'Generate prompts for all scenes first' : '请先为所有分镜生成提示词')
                                                : (language === 'English' ? 'Generate all asset reference images first' : '请先生成所有资产参考图')}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    <div className="group relative">
                        {(() => {
                            const allHaveImages = chunk.scenes.length > 0 && chunk.scenes.every(s => {
                                if (s.prompt_options) {
                                    return s.prompt_options.every(opt => !!opt.imageUrl || !!opt.imageAssetId);
                                }
                                return !!s.imageUrl || !!s.imageAssetId;
                            });
                            const allVideoReady = allHaveImages && chunk.scenes.every(s => getVideoAssetsReady(s));
                            const filmReady = allVideoReady && loadingStep !== 'filming';
                            const hasNoVideoPrompts = chunk.scenes.length > 0 && chunk.scenes.some(s => !s.video_prompt?.trim());
                            return (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleMakeFilm(); }}
                                        disabled={!filmReady}
                                        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 shadow-lg ${filmReady
                                            ? 'bg-rose-600 dark:bg-red-500 text-white hover:bg-rose-700 dark:hover:bg-red-400 shadow-rose-500/20 dark:shadow-red-500/20'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {loadingStep === 'filming' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                                        {labels.btnFilm}
                                    </button>
                                    {!filmReady && chunk.scenes.length > 0 && loadingStep !== 'filming' && (
                                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                                            {!allHaveImages
                                                ? (language === 'English' ? 'Generate all scene images first' : '请先生成所有分镜图片')
                                                : hasNoVideoPrompts
                                                    ? (language === 'English' ? 'Generate prompts for all scenes first' : '请先为所有分镜生成提示词')
                                                    : (language === 'English' ? 'Generate all referenced asset/scene images first' : '请先生成所有引用的资产/分镜图')}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    <div className="group relative">
                        <button
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (chunk.scenes.length > 0) {
                                    setActiveCanvasSceneId(chunk.scenes[0].id);
                                }
                            }}
                            disabled={chunk.scenes.length === 0}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 shadow-sm transition-all whitespace-nowrap ${
                                chunk.scenes.length > 0
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            <Layers className="w-4 h-4" />
                            全景工坊
                        </button>
                        {chunk.scenes.length === 0 && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                                {language === 'English' ? 'Generate Storyboard first' : '请先生成分镜'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Body */}
                {isActive && (
                    <div className="p-4 border-t border-gray-200 dark:border-white/10 space-y-4">
                        {chunk.scenes.length === 0 ? (
                            <div className="text-center py-8 text-gray-600 italic text-sm">
                                {labels.statusReady}. Generate Script to begin.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {chunk.scenes.map(scene => (
                                    <SceneCard
                                        key={scene.id}
                                        scene={scene}
                                        characterDesc=""
                                        labels={labels}
                                        onUpdate={handleSceneUpdateWrapper}
                                        onDelete={handleDeleteScene}
                                        onDuplicate={handleDuplicateScene}
                                        isGeneratingExternal={generatingSceneIds.includes(scene.id)}
                                        isGeneratingPrompts={activePromptSceneId === scene.id}
                                        isPromptCompleted={completedPromptSceneIds.includes(scene.id)}
                                        onGenerateImageOverride={handleGenerateImageInternal}
                                        onImageGenerated={handleImageGenerated}
                                        onVideoGenerated={handleVideoGenerated}
                                        globalStyle={styleState}
                                        areAssetsReady={getSceneAssetsReady(scene)}
                                        videoAssetsReady={getVideoAssetsReady(scene)}
                                        checkImageReady={(optId) => getSceneAssetsReady(scene, optId)}
                                        flashSceneId={flashSceneId}
                                        assets={globalAssets}
                                        onAddAsset={handleAddChunkAssets}
                                        language={language}
                                        chapterScenes={chunk.scenes}
                                        chunk={chunk}
                                        onUpdateChunk={onUpdateChunk}
                                        onOpenCanvas={(sceneId, optionId) => {
                                            setActiveCanvasSceneId(sceneId);
                                            setActiveCanvasOptionId(optionId);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {showTextModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-dark-800 rounded-xl w-full max-w-5xl flex flex-col max-h-[90vh] border border-gray-200 dark:border-white/10 shadow-2xl">
                        <div className="p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-white/5 rounded-t-xl">
                            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500 dark:text-banana-400" />
                                {language === 'Chinese' ? '章节内容' : 'Chapter Content'}
                            </h3>
                            <button onClick={() => setShowTextModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-hidden flex flex-col relative group">
                            <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full flex-1 bg-gray-50 dark:bg-[#121216] border border-gray-200 dark:border-white/5 rounded-lg p-4 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-indigo-500 dark:focus:border-banana-500/50 focus:ring-1 focus:ring-indigo-500/30 dark:focus:ring-banana-500/30 resize-none transition-all leading-relaxed min-h-[60vh]"
                                placeholder={language === 'Chinese' ? '在这里编辑小说原文...' : 'Edit novel text here...'}
                            />
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-white/10 flex justify-end gap-3 bg-gray-50 dark:bg-dark-900 rounded-b-xl">
                            <button
                                onClick={() => setShowTextModal(false)}
                                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white font-medium transition-colors"
                            >
                                {language === 'Chinese' ? '取消' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => {
                                    onUpdateChunk(chunk.id, { text: editingText });
                                    setShowTextModal(false);
                                }}
                                className="px-5 py-2 text-sm bg-indigo-600 dark:bg-banana-500 text-white dark:text-black font-bold rounded hover:bg-indigo-700 dark:hover:bg-banana-400 shadow-lg shadow-indigo-500/20 dark:shadow-banana-500/20 transition-all flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {language === 'Chinese' ? '保存更改' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeCanvasScene && (
                <CanvasModalWrapper
                    isOpen={!!activeCanvasSceneId}
                    onClose={() => {
                        setActiveCanvasSceneId(null);
                        setActiveCanvasOptionId(undefined);
                    }}
                    scene={activeCanvasScene}
                    initialOptionId={activeCanvasOptionId}
                    allScenes={chunk.scenes}
                    assets={globalAssets}
                    styleState={styleState}
                    labels={labels}
                    onSceneUpdate={(sceneId, updates) => onSceneUpdate(chunk.id, sceneId, updates)}
                    language={language}
                    chunk={chunk}
                    onUpdateChunk={onUpdateChunk}
                    getSceneAssetsReady={getSceneAssetsReady}
                    getVideoAssetsReady={getVideoAssetsReady}
                    onSelectScene={(sceneId) => setActiveCanvasSceneId(sceneId)}
                    onAddScene={handleAddScene}
                    onGenerateImageOverride={handleGenerateImageInternal}
                    onImageGenerated={handleImageGenerated}
                    onVideoGenerated={handleVideoGenerated}
                    onAddAsset={onAddAsset}
                />
            )}
        </>
    );
};

interface CanvasModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    scene: Scene;
    initialOptionId?: string;
    allScenes: Scene[];
    assets: Asset[];
    styleState: GlobalStyle;
    labels: Translation;
    onSceneUpdate: (sceneId: string, updates: Partial<Scene> | ((prev: Scene) => Partial<Scene>)) => void;
    language: string;
    chunk: NovelChunk;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => void;
    getSceneAssetsReady: (scene: Scene, optionId?: string) => boolean;
    getVideoAssetsReady: (scene: Scene, optionId?: string) => boolean;
    onSelectScene: (sceneId: string) => void;
    onAddScene: () => void;
    onGenerateImageOverride: (scene: Scene, optionId?: string, signal?: AbortSignal) => Promise<string>;
    onImageGenerated: (id: string, url: string, imageAssetId?: string, optionId?: string) => void;
    onVideoGenerated: (id: string, url: string, assetId?: string, optionId?: string, operation?: any) => void;
    onAddAsset?: (asset: Asset) => void;
}

const CanvasModalWrapper: React.FC<CanvasModalWrapperProps> = ({
    isOpen,
    onClose,
    scene,
    initialOptionId,
    allScenes,
    assets,
    styleState,
    labels,
    onSceneUpdate,
    language,
    chunk,
    onUpdateChunk,
    getSceneAssetsReady,
    getVideoAssetsReady,
    onSelectScene,
    onAddScene,
    onGenerateImageOverride,
    onImageGenerated,
    onVideoGenerated,
    onAddAsset
}) => {
    const combinedAssets = (() => {
        const map = new Map<string, Asset>();
        assets.forEach(a => { if (a && a.id) map.set(a.id, a); });
        (chunk.assets || []).forEach(a => { if (a && a.id) map.set(a.id, a); });
        return Array.from(map.values());
    })();

    const mediaState = useSceneMedia({
        scene,
        characterDesc: '',
        globalStyle: styleState,
        assets: combinedAssets,
        areAssetsReady: getSceneAssetsReady(scene),
        language,
        chapterScenes: allScenes,
        onUpdate: (sceneId, fieldOrUpdates, value) => {
            if (typeof fieldOrUpdates === 'string') {
                onSceneUpdate(sceneId, { [fieldOrUpdates]: value });
            } else {
                onSceneUpdate(sceneId, fieldOrUpdates);
            }
        },
        onGenerateImageOverride,
        onImageGenerated,
        onVideoGenerated,
        checkImageReady: (optId) => getSceneAssetsReady(scene, optId),
        checkVideoReady: (optId) => getVideoAssetsReady(scene, optId)
    });

    useEffect(() => {
        if (isOpen) {
            mediaState.syncMediaStatus();
        }
    }, [isOpen, scene.id, scene.imageUrl, scene.videoUrl, scene.isStartEndFrameMode, scene.startEndVideoUrl]);

    const onUploadImage = async (file: File, optionId?: string) => {
        try {
            const assetId = await saveAsset(file);
            const localUrl = URL.createObjectURL(file);
            
            const targetOptionId = optionId || 'A';
            
            onSceneUpdate(scene.id, (prev) => {
                const updates: Partial<Scene> = {};
                
                if (targetOptionId === 'A') {
                    updates.imageUrl = localUrl;
                    updates.imageAssetId = assetId;
                    if (prev.isStartEndFrameMode) {
                        const currentSceneImgId = `scene_img_${prev.id}`;
                        updates.startEndAssetIds = [currentSceneImgId];
                    }
                }
                
                if (prev.prompt_options) {
                    const newOptions = [...prev.prompt_options];
                    let activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
                    if (activeOptIdx === -1) {
                        newOptions.push({
                            option_id: targetOptionId,
                            np_prompt: targetOptionId === 'A' ? (prev.np_prompt || '') : '',
                            video_prompt: targetOptionId === 'A' ? (prev.video_prompt || '') : '',
                            camera: targetOptionId === 'A' ? (prev.camera || '') : '',
                            lens: targetOptionId === 'A' ? (prev.lens || '') : '',
                            focal_length: targetOptionId === 'A' ? (prev.focal_length || '') : '',
                            aperture: targetOptionId === 'A' ? (prev.aperture || '') : '',
                        });
                        activeOptIdx = newOptions.length - 1;
                    }
                    newOptions[activeOptIdx] = { 
                        ...newOptions[activeOptIdx], 
                        imageUrl: localUrl,
                        imageAssetId: assetId
                    };
                    updates.prompt_options = newOptions;
                }
                return updates;
            });
        } catch (e) {
            console.error("Failed to upload image from canvas:", e);
            alert("上传图片失败，请重试。");
        }
    };

    const onUploadVideo = async (file: File, optionId?: string) => {
        if (file.size > 20 * 1024 * 1024) {
            alert('视频 file 大小不能超过20MB，请压缩后上传');
            return;
        }

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

            const targetOptionId = optionId || 'A';

            onSceneUpdate(scene.id, (prev) => {
                const updates: Partial<Scene> = {};
                if (targetOptionId === 'A') {
                    if (prev.isStartEndFrameMode) {
                        updates.startEndVideoUrl = url;
                    } else {
                        updates.videoUrl = url;
                    }
                }

                if (prev.prompt_options) {
                    const newOptions = [...prev.prompt_options];
                    let activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
                    if (activeOptIdx === -1) {
                        newOptions.push({
                            option_id: targetOptionId,
                            np_prompt: targetOptionId === 'A' ? (prev.np_prompt || '') : '',
                            video_prompt: targetOptionId === 'A' ? (prev.video_prompt || '') : '',
                            camera: targetOptionId === 'A' ? (prev.camera || '') : '',
                            lens: targetOptionId === 'A' ? (prev.lens || '') : '',
                            focal_length: targetOptionId === 'A' ? (prev.focal_length || '') : '',
                            aperture: targetOptionId === 'A' ? (prev.aperture || '') : '',
                        });
                        activeOptIdx = newOptions.length - 1;
                    }
                    newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], videoUrl: url };
                    updates.prompt_options = newOptions;
                }
                return updates;
            });
        } catch (e: any) {
            console.error("Failed to upload video from canvas:", e);
            alert("上传视频失败: " + e.message);
        }
    };

    const onDeleteImage = (optionId?: string) => {
        const targetOptionId = optionId || 'A';
        onSceneUpdate(scene.id, (prev) => {
            const updates: Partial<Scene> = {};
            if (targetOptionId === 'A') {
                updates.imageUrl = undefined;
                updates.imageAssetId = undefined;
            }

            if (prev.prompt_options) {
                const newOptions = [...prev.prompt_options];
                let activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
                if (activeOptIdx !== -1) {
                    newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], imageUrl: undefined, imageAssetId: undefined };
                    updates.prompt_options = newOptions;
                }
            }
            return updates;
        });
    };

    const onDeleteVideo = (optionId?: string) => {
        const targetOptionId = optionId || 'A';
        onSceneUpdate(scene.id, (prev) => {
            const updates: Partial<Scene> = {};
            if (targetOptionId === 'A') {
                if (prev.isStartEndFrameMode) {
                    updates.startEndVideoUrl = undefined;
                    updates.startEndVideoAssetId = undefined;
                } else {
                    updates.videoUrl = undefined;
                    updates.videoAssetId = undefined;
                }
            }

            if (prev.prompt_options) {
                const newOptions = [...prev.prompt_options];
                let activeOptIdx = newOptions.findIndex((o) => o.option_id === targetOptionId);
                if (activeOptIdx !== -1) {
                    newOptions[activeOptIdx] = { ...newOptions[activeOptIdx], videoUrl: undefined, videoAssetId: undefined };
                    updates.prompt_options = newOptions;
                }
            }
            return updates;
        });
    };

    const genStatusMap = {
        A: mediaState.getGenStatus('A'),
        B: mediaState.getGenStatus('B'),
        C: mediaState.getGenStatus('C'),
        default: mediaState.getGenStatus('default'),
    };

    const videoStatusMap = {
        A: mediaState.getVideoStatus('A'),
        B: mediaState.getVideoStatus('B'),
        C: mediaState.getVideoStatus('C'),
        default: mediaState.getVideoStatus('default'),
    };

    return (
        <SceneCanvasModal
            isOpen={isOpen}
            onClose={onClose}
            scene={scene}
            initialOptionId={initialOptionId}
            allScenes={allScenes}
            assets={combinedAssets}
            styleState={styleState}
            labels={labels}
            onSceneUpdate={(sceneId, updates) => onSceneUpdate(sceneId, updates)}
            onGenerateImage={(scene, optionId) => mediaState.handleGenerateImage(true, optionId).then(() => '')}
            onGenerateVideo={(scene, optionId) => mediaState.handleGenerateVideo(optionId)}
            onUploadImage={onUploadImage}
            onUploadVideo={onUploadVideo}
            onDeleteImage={onDeleteImage}
            onDeleteVideo={onDeleteVideo}
            onSelectScene={onSelectScene}
            onAddScene={onAddScene}
            genStatusMap={genStatusMap}
            videoStatusMap={videoStatusMap}
            onAddAsset={onAddAsset}
            language={language}
        />
    );
};

export default ChunkPanel;
