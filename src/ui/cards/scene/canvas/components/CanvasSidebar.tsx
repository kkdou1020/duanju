import React from 'react';
import { Layers, Aperture, Image as ImageIcon, Film, User, MapPin, Box, Video, Music } from 'lucide-react';
import { useCanvas } from '../context/CanvasContext';
import { Asset } from '@/shared/types';

export const CanvasSidebar: React.FC = () => {
    const {
        assets,
        allScenes,
        scene,
        setHoveredItem
    } = useCanvas();

    return (
        <div className="w-[260px] border-r border-white/5 bg-[#121216] flex flex-col flex-shrink-0 z-10 select-none">
            {/* 侧边栏标题 */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-100 tracking-wider uppercase">全景工具箱</span>
                <Layers className="w-4 h-4 text-cyan-400" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* 1. 可拖拽的功能节点 */}
                <div className="space-y-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">功能节点</span>
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', 'imagePrompt');
                            e.dataTransfer.setData('text/plain', 'imagePrompt');
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-cyan-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-cyan-500/5 transition-all"
                    >
                        <Aperture className="w-4 h-4 text-cyan-400" />
                        image 生成配置节点
                    </div>
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', 'imageOutput');
                            e.dataTransfer.setData('text/plain', 'imageOutput');
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-pink-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-pink-500/5 transition-all"
                    >
                        <ImageIcon className="w-4 h-4 text-pink-400" />
                        image 输出节点
                    </div>
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', 'videoPrompt');
                            e.dataTransfer.setData('text/plain', 'videoPrompt');
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-purple-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-purple-500/5 transition-all"
                    >
                        <Film className="w-4 h-4 text-purple-400" />
                        video 生成配置节点
                    </div>
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', 'videoOutput');
                            e.dataTransfer.setData('text/plain', 'videoOutput');
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-purple-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-purple-500/5 transition-all"
                    >
                        <Film className="w-4 h-4 text-purple-400 animate-pulse" />
                        video 输出播放节点
                    </div>
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', 'firstLastFrame');
                            e.dataTransfer.setData('text/plain', 'firstLastFrame');
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-yellow-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-yellow-500/5 transition-all"
                    >
                        <Film className="w-4 h-4 text-yellow-400" />
                        首尾帧提取节点
                    </div>
                </div>

                {/* 2. 项目角色与场景资产 */}
                <div className="space-y-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">项目资产</span>
                    <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                        {assets.map((asset) => (
                            <div
                                key={asset.id}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/reactflow', 'asset');
                                    e.dataTransfer.setData('assetId', asset.id);
                                    e.dataTransfer.setData('text/plain', JSON.stringify({
                                        type: 'asset',
                                        assetId: asset.id
                                    }));
                                }}
                                onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredItem({
                                        type: 'asset',
                                        data: asset,
                                        rect: {
                                            top: rect.top,
                                            right: rect.right,
                                            bottom: rect.bottom,
                                            left: rect.left
                                        }
                                    });
                                }}
                                onMouseLeave={() => setHoveredItem(null)}
                                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 cursor-grab active:cursor-grabbing transition-colors"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                <span className="truncate">{asset.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. 分镜快照引用 */}
                <div className="space-y-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">分镜引用</span>
                    <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                        {allScenes.filter(s => s.id !== scene.id).flatMap((s) => {
                            const items: { key: string; label: string; sceneId: string; optionId?: string; hasImage: boolean }[] = [];
                            let hasOptions = false;

                            if (s.prompt_options && s.prompt_options.length > 0) {
                                s.prompt_options.forEach(opt => {
                                    if (opt.imageUrl || opt.imageAssetId) {
                                        hasOptions = true;
                                        items.push({
                                            key: `${s.id}_${opt.option_id}`,
                                            label: `分镜 ${s.id}-${opt.option_id}`,
                                            sceneId: s.id,
                                            optionId: opt.option_id,
                                            hasImage: true
                                        });
                                    }
                                });
                            }

                            if (!hasOptions) {
                                items.push({
                                    key: s.id,
                                    label: `分镜 ${s.id}`,
                                    sceneId: s.id,
                                    hasImage: !!(s.imageUrl || s.imageAssetId)
                                });
                            }

                            return items;
                        }).map((item) => (
                            <div
                                key={item.key}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/reactflow', 'sceneRef');
                                    e.dataTransfer.setData('sceneId', item.sceneId);
                                    if (item.optionId) {
                                        e.dataTransfer.setData('optionId', item.optionId);
                                    }
                                    e.dataTransfer.setData('text/plain', JSON.stringify({
                                        type: 'sceneRef',
                                        sceneId: item.sceneId,
                                        optionId: item.optionId
                                    }));
                                }}
                                onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const matchedScene = allScenes.find(s => s.id === item.sceneId);
                                    setHoveredItem({
                                        type: 'scene',
                                        data: {
                                            ...item,
                                            scene: matchedScene
                                        },
                                        rect: {
                                            top: rect.top,
                                            right: rect.right,
                                            bottom: rect.bottom,
                                            left: rect.left
                                        }
                                    });
                                }}
                                onMouseLeave={() => setHoveredItem(null)}
                                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 cursor-grab active:cursor-grabbing transition-colors"
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${item.hasImage ? 'bg-green-400' : 'bg-pink-400'}`} />
                                <span className="truncate">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
