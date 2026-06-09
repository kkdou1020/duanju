import React from 'react';
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronLeft, X, Settings, Check, Undo, Redo, Copy, Clipboard, Scissors, Plus, User, MapPin, Box, Video, Music, Image as ImageIcon, Film } from 'lucide-react';
import { Scene, Asset, GlobalStyle, ImageGenStatus } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { SettingsPanel } from '@/ui/panels/SettingsPanel';
import { modelManager, useModelConfig } from '@/services/ai/model-manager';

import { CanvasProvider, useCanvas } from './context/CanvasContext';
import { useCanvasState } from './hooks/useCanvasState';
import { CanvasSidebar } from './components/CanvasSidebar';
import { nodeTypes } from './components/CustomNodeFactory';
import { getMiniMapNodeColor } from './utils/canvasHelpers';

interface SceneCanvasModalProps {
    isOpen: boolean;
    onClose: () => void;
    scene: Scene;
    allScenes: Scene[];
    assets: Asset[];
    styleState: GlobalStyle;
    labels: Translation;
    onSceneUpdate: (sceneId: string, updates: Partial<Scene> | ((prev: Scene) => Partial<Scene>)) => void;
    onGenerateImage: (scene: Scene, optionId?: string) => Promise<string>;
    onGenerateVideo: (scene: Scene, optionId?: string) => Promise<any>;
    onUploadImage: (file: File, optionId?: string) => Promise<void>;
    onUploadVideo: (file: File, optionId?: string) => Promise<void>;
    onDeleteImage: (optionId?: string) => void;
    onDeleteVideo: (optionId?: string) => void;
    onSelectScene: (sceneId: string) => void;
    onAddScene: () => void;
    genStatusMap: Record<string, ImageGenStatus>;
    videoStatusMap: Record<string, ImageGenStatus>;
    onAddAsset?: (asset: Asset) => void;
    initialOptionId?: string;
    language?: string;
}

const InnerSceneCanvas: React.FC = () => {
    const context = useCanvas();
    const {
        isOpen,
        onClose,
        scene,
        allScenes,
        activeOption,
        setActiveOption,
        showSettingsModal,
        setShowSettingsModal,
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        setReactFlowInstance,
        pastCount,
        futureCount,
        undo,
        redo,
        copyNodes,
        cutNodes,
        pasteNodes,
        handleResetLayout,
        onNodeDragStart,
        onNodeDragStop,
        onPaneDoubleClick,
        onDragOver,
        onDrop,
        hoveredItem,
        currentGenStatus,
        currentVideoStatus,
        language,
        labels,
        onSelectScene,
        onAddScene,
    } = context;

    const modelConfig = useModelConfig();

    // 根据画布节点生成态自动渲染边流动效果
    const processedEdges = React.useMemo(() => {
        return edges.map(edge => {
            const targetNode = nodes.find(n => n.id === edge.target);
            let isGenerating = false;

            if (targetNode) {
                if (targetNode.id === 'image-prompt') {
                    isGenerating = currentGenStatus === ImageGenStatus.GENERATING;
                } else if (targetNode.id === 'video-prompt') {
                    isGenerating = currentVideoStatus === ImageGenStatus.GENERATING;
                } else if (targetNode.id === 'image-output') {
                    isGenerating = currentGenStatus === ImageGenStatus.GENERATING;
                } else if (targetNode.id === 'video-output') {
                    isGenerating = currentVideoStatus === ImageGenStatus.GENERATING;
                } else if (targetNode.id === 'audio') {
                    isGenerating = !!targetNode.data?.ttsLoading;
                }
            }

            if (isGenerating) {
                return {
                    ...edge,
                    animated: true,
                    className: 'marching-ants',
                    style: {
                        ...edge.style,
                        strokeDasharray: '5,5'
                    }
                };
            }

            return edge;
        });
    }, [edges, nodes, currentGenStatus, currentVideoStatus]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex bg-[#0c0c0f] text-gray-200 animate-fadeIn">
            {/* 侧边栏工具箱 */}
            <CanvasSidebar />

            {/* 画布主渲染容器 */}
            <div className="flex-1 min-w-0 flex flex-col relative h-full">
                {/* 顶部主工作菜单 */}
                <div className="h-[60px] border-b border-white/5 bg-[#121216]/80 backdrop-blur-md flex items-center justify-between px-6 z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-gray-100 tracking-wider">全景分镜工坊</h2>
                            <p className="text-[10px] text-gray-400 font-medium">当前场景：S{scene.id}</p>
                        </div>
                    </div>

                    {/* 配置操作区 */}
                    <div className="flex items-center gap-3">
                        {/* 方案 A/B/C 通道切换 */}
                        <div className="flex bg-[#1c1c24] border border-white/5 rounded-full p-1 gap-1">
                            {(['A', 'B', 'C'] as const).map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setActiveOption(opt)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${activeOption === opt
                                            ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                                            : 'text-gray-400 hover:text-white'
                                        }`}
                                >
                                    方案 {opt}
                                </button>
                            ))}
                        </div>

                        {/* 画布撤销重做与剪贴板快捷栏 */}
                        <div className="flex bg-[#1c1c24] border border-white/5 rounded-full p-1 gap-1 items-center">
                            <button
                                onClick={undo}
                                disabled={pastCount === 0}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-all cursor-pointer flex items-center justify-center"
                                title="撤销 (Ctrl+Z)"
                            >
                                <Undo className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={futureCount === 0}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-all cursor-pointer flex items-center justify-center"
                                title="重做 (Ctrl+Y)"
                            >
                                <Redo className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-[1px] h-3.5 bg-white/10 mx-1" />
                            <button
                                onClick={copyNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="复制选中节点 (Ctrl+C)"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={cutNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="剪切选中节点 (Ctrl+X)"
                            >
                                <Scissors className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={pasteNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="粘贴节点 (Ctrl+V)"
                            >
                                <Clipboard className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* 重置排版与系统配置 */}
                        <button
                            onClick={handleResetLayout}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-white/10 hover:border-cyan-500/30 bg-[#1c1c24] hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white transition-all cursor-pointer"
                            title="清空位置缓存，重置为标准树状布局"
                        >
                            <span>重置布局</span>
                        </button>

                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                            title={language === 'Chinese' ? "系统设置" : "System Settings"}
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* React Flow 无限网格画布 */}
                <div
                    className="flex-1 w-full bg-[#0a0a0d]"
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                >
                    <ReactFlow
                        nodes={nodes}
                        edges={processedEdges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={context.onConnect}
                        onEdgesDelete={context.onEdgesDelete}
                        onNodesDelete={context.onNodesDelete}
                        onNodeDragStart={onNodeDragStart}
                        onNodeDragStop={onNodeDragStop}
                        onDoubleClick={(event) => {
                            const target = event.target as HTMLElement;
                            if (target.classList?.contains('react-flow__pane')) {
                                onPaneDoubleClick(event);
                            }
                        }}
                        onInit={setReactFlowInstance}
                        nodeTypes={nodeTypes}
                        proOptions={{ hideAttribution: true }}
                        fitView
                        className="react-flow-dark"
                    >
                        <Background color="#1f1f2e" gap={16} size={1} />
                        <Controls className="!bg-[#121216] !border-white/5 !text-gray-400 [&_button]:!border-white/5 hover:[&_button]:!bg-white/5" />
                        <MiniMap
                            zoomable
                            pannable
                            nodeColor={getMiniMapNodeColor}
                            className="custom-minimap"
                            maskColor="rgba(0, 0, 0, 0.4)"
                        />
                    </ReactFlow>
                </div>

                {/* 底部 DOCK 场景滑动器 */}
                <div className="h-[120px] border-t border-white/5 bg-[#121216]/90 backdrop-blur-md flex items-center px-6 gap-4 overflow-hidden z-10 shrink-0 select-none">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block w-10 shrink-0">场景<br />DOCK</span>

                    <div className="flex-1 min-w-0 h-full flex items-center gap-3 overflow-x-auto overflow-y-hidden pt-2 pb-4 pr-4 custom-dock-scrollbar">
                        {allScenes.map((s) => {
                            const isCurrent = s.id === scene.id;
                            const option = activeOption && s.prompt_options ? s.prompt_options.find(o => o.option_id === activeOption) : null;
                            const img = option?.imageUrl || s.imageUrl;

                            return (
                                <div
                                    key={s.id}
                                    onClick={() => onSelectScene(s.id)}
                                    className={`flex-shrink-0 w-[140px] aspect-[16/10] rounded-xl border bg-black/40 overflow-hidden relative cursor-pointer hover:scale-[1.02] hover:border-cyan-500/20 active:scale-[0.98] transition-all flex flex-col ${isCurrent ? 'border-cyan-500 ring-1 ring-cyan-500/30' : 'border-white/5'
                                        }`}
                                >
                                    {img ? (
                                        <img src={img} alt={`Scene ${s.id}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-gray-600 text-[10px]">
                                            <span>未生成分镜图</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center justify-between gap-1">
                                        <span className="text-[10px] font-bold text-white whitespace-nowrap flex-shrink-0">分镜 {s.id}</span>
                                        <span className="text-[8px] text-gray-400 max-w-[70px] truncate">{s.narration || '暂无内容'}</span>
                                    </div>
                                </div>
                            );
                        })}

                        <div
                            onClick={onAddScene}
                            className="flex-shrink-0 w-[140px] aspect-[16/10] rounded-xl border border-dashed border-white/10 hover:border-cyan-500/30 bg-[#16161e]/50 hover:bg-[#16161e] flex flex-col items-center justify-center gap-1.5 cursor-pointer text-gray-400 hover:text-cyan-400 transition-all active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="text-[10px] font-bold tracking-wider">添加新场景</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 鼠标悬停预览卡片弹层 */}
            {hoveredItem && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${hoveredItem.rect.right + 10}px`,
                        top: `${Math.max(10, Math.min(window.innerHeight - 340, hoveredItem.rect.top))}px`,
                    }}
                    className="z-[999] w-[300px] bg-[#16161c]/95 border border-white/10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] backdrop-blur-md overflow-hidden text-left"
                >
                    {hoveredItem.type === 'asset' && (() => {
                        const asset = hoveredItem.data as Asset;
                        const getIcon = () => {
                            switch (asset.type) {
                                case 'character': return <User className="w-3.5 h-3.5 text-cyan-400" />;
                                case 'location': return <MapPin className="w-3.5 h-3.5 text-emerald-400" />;
                                case 'item': return <Box className="w-3.5 h-3.5 text-amber-400" />;
                                case 'video': return <Video className="w-3.5 h-3.5 text-purple-400" />;
                                case 'audio': return <Music className="w-3.5 h-3.5 text-pink-400" />;
                                default: return <Box className="w-3.5 h-3.5 text-gray-400" />;
                            }
                        };
                        const getBorderColor = () => {
                            switch (asset.type) {
                                case 'character': return 'border-cyan-500/30';
                                case 'location': return 'border-emerald-500/30';
                                case 'item': return 'border-amber-500/30';
                                case 'video': return 'border-purple-500/30';
                                case 'audio': return 'border-pink-500/30';
                                default: return 'border-white/10';
                            }
                        };
                        const getTypeName = () => {
                            switch (asset.type) {
                                case 'character': return '角色';
                                case 'location': return '场景';
                                case 'item': return '道具';
                                case 'video': return '视频资产';
                                case 'audio': return '音频资产';
                                default: return '资产';
                            }
                        };
                        const mediaUrl = asset.refImageUrl || undefined;

                        return (
                            <div className={`flex flex-col border-t-2 ${getBorderColor()}`}>
                                {mediaUrl ? (
                                    <div className="w-full aspect-[16/10] bg-black/40 relative overflow-hidden border-b border-white/5">
                                        <img
                                            src={mediaUrl}
                                            alt={asset.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full aspect-[16/10] bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 border-b border-white/5">
                                        <div className="p-3 bg-white/5 rounded-full">
                                            {getIcon()}
                                        </div>
                                        <span className="text-[10px] text-gray-500">无预览图片</span>
                                    </div>
                                )}

                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {getIcon()}
                                            <h4 className="text-xs font-bold text-gray-100 truncate max-w-[150px]">{asset.name}</h4>
                                        </div>
                                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 font-semibold uppercase">
                                            {getTypeName()}
                                        </span>
                                    </div>

                                    {asset.description && (
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">描述</span>
                                            <p className="text-[10px] text-gray-300 leading-relaxed max-h-16 overflow-y-auto custom-dock-scrollbar">
                                                {asset.description}
                                            </p>
                                        </div>
                                    )}

                                    {asset.visualDna && (
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">视觉 DNA</span>
                                            <div className="flex flex-wrap gap-1">
                                                {asset.visualDna.split(',').map((t, idx) => (
                                                    <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-400 border border-cyan-500/10">
                                                        {t.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {hoveredItem.type === 'scene' && (() => {
                        const item = hoveredItem.data;
                        const matchedScene = item.scene as Scene | undefined;
                        if (!matchedScene) return null;

                        const option = item.optionId && matchedScene.prompt_options
                            ? matchedScene.prompt_options.find((o: any) => o.option_id === item.optionId)
                            : null;

                        const imageUrl = option?.imageUrl || matchedScene.imageUrl;

                        return (
                            <div className={`flex flex-col border-t-2 ${imageUrl ? 'border-green-500/30' : 'border-pink-500/30'}`}>
                                {imageUrl ? (
                                    <div className="w-full aspect-[16/10] bg-black/40 relative overflow-hidden border-b border-white/5">
                                        <img
                                            src={imageUrl}
                                            alt={item.label}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-green-950/80 border border-green-500/30 rounded text-[8px] text-green-300 font-bold uppercase tracking-wider">
                                            图片预览
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full aspect-[16/10] bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 border-b border-white/5">
                                        <div className="p-3 bg-white/5 rounded-full">
                                            <ImageIcon className="w-4 h-4 text-pink-400" />
                                        </div>
                                        <span className="text-[10px] text-gray-500">未生成分镜图</span>
                                    </div>
                                )}

                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Film className="w-4 h-4 text-cyan-400" />
                                            <h4 className="text-xs font-bold text-gray-100 truncate max-w-[150px]">{item.label}</h4>
                                        </div>
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${imageUrl ? 'bg-green-950/30 text-green-400 border border-green-500/10' :
                                                'bg-pink-950/30 text-pink-400 border border-pink-500/10'
                                            }`}>
                                            {imageUrl ? '图片' : '未生成'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* 配置设置 Dialog */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200 text-left">
                    <div className="bg-white dark:bg-dark-800 rounded-xl w-full max-w-5xl flex flex-col max-h-[90vh] border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/5 flex justify-between items-center bg-gray-50 dark:bg-[#17171a]">
                            <div className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-indigo-600 dark:text-banana-400" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white tracking-wide">
                                    {language === 'Chinese' ? "系统设置" : "System Settings"}
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowSettingsModal(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-2 bg-white dark:bg-dark-800">
                            <SettingsPanel
                                providers={modelConfig.providers}
                                onUpdateProviders={(updatedProviders) => modelManager.setConfig({ providers: updatedProviders })}
                                activeTextModel={modelConfig.textmodel}
                                activeImageModel={modelConfig.imagemodel}
                                activeVideoModel={modelConfig.videomodel}
                                onChangeActiveModel={(type, val) => {
                                    if (type === 'text') {
                                        const provider = modelConfig.providers.find(p => p.id === val);
                                        const firstModel = provider?.chatModels?.[0] || 'gpt-5.4-mini-2026-03-17';
                                        modelManager.setConfig({
                                            textmodel: val,
                                            t8starTextModel: firstModel
                                        });
                                    }
                                    if (type === 'image') modelManager.setConfig({ imagemodel: val });
                                    if (type === 'video') modelManager.setConfig({ videomodel: val });
                                }}
                                language={language}
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#17171a]">
                            <button
                                onClick={() => setShowSettingsModal(false)}
                                className="px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 dark:bg-banana-400 text-white dark:text-black flex items-center gap-1.5 shadow-md shadow-indigo-600/20 dark:shadow-banana-400/20 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                            >
                                <Check className="w-4 h-4 stroke-[3]" />
                                {language === 'Chinese' ? "保存并确定" : "Save & Close"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const SceneCanvasModal: React.FC<SceneCanvasModalProps> = (props) => {
    const canvasState = useCanvasState(props);

    const canvasContextValue = {
        ...props,
        ...canvasState,
        onConnect: canvasState.handleConnect,
        onEdgesDelete: canvasState.handleEdgesDelete,
        onNodesDelete: canvasState.handleNodesDelete,
        language: props.language || 'Chinese'
    };

    return (
        <CanvasProvider value={canvasContextValue}>
            <InnerSceneCanvas />
        </CanvasProvider>
    );
};
