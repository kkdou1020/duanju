import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Film, Settings, Sparkles, Loader2, Info } from 'lucide-react';
import MentionTextarea, { SceneImageCandidate } from '@/ui/components/MentionTextarea';
import { ImageGenStatus, Asset } from '@/shared/types';

interface VideoPromptNodeProps {
    id: string;
    data: {
        video_prompt: string;
        videoModel: string;
        refImageMode: 'auto' | 'first_frame' | 'start_end_frame';
        audio_sfx?: string;
        audio_bgm?: string;
        onUpdate: (field: string, value: any) => void;
        onGenerate: () => void;
        onApply?: () => void;
        videoStatus: ImageGenStatus;
        onBlur?: () => void;
        assets: Asset[];
        sceneImages: SceneImageCandidate[];
        connectedImages?: Array<{ nodeId: string; url: string; assetId?: string; name: string }>;
        onDisconnectImage?: (sourceNodeId: string) => void;
        isMainGenerating?: boolean;
        isSelfGenerating?: boolean;
    };
}

export const VideoPromptNode: React.FC<VideoPromptNodeProps> = ({ id, data }) => {
    const {
        video_prompt,
        videoModel,
        refImageMode,
        audio_sfx,
        audio_bgm,
        onUpdate,
        onGenerate,
        onApply,
        videoStatus,
        onBlur,
        assets,
        sceneImages,
        connectedImages,
        onDisconnectImage,
        isMainGenerating,
        isSelfGenerating
    } = data;

    const isGenerating = videoStatus === ImageGenStatus.GENERATING;

    return (
        <div className="relative flex flex-col gap-3.5 p-4 rounded-2xl border border-purple-500/30 bg-[#0e0e11]/90 shadow-2xl shadow-purple-500/5 w-[300px]">
            {/* Single Target handle on the LEFT */}
            <Handle
                type="target"
                position={Position.Left}
                id="target-video-images"
                style={{ top: '50%', background: '#a855f7' }}
                className="w-2.5 h-2.5 border-2 border-slate-900 rounded-full !left-[-5px]"
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-purple-400 animate-pulse" />
                    <span className="text-xs font-bold text-gray-100 tracking-wider">Video 生成配置</span>
                </div>
                <Settings className="w-3.5 h-3.5 text-gray-500" />
            </div>

            {/* Config Fields */}
            <div className="flex flex-col gap-3">
                {/* Video Engine Model */}
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">生成模型 (Engine)</span>
                    <select
                        value={videoModel || 'doubao-seedance-2-0-260128'}
                        onChange={(e) => onUpdate('videoModel', e.target.value)}
                        className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-purple-500 cursor-pointer"
                    >
                        <option value="doubao-seedance-2-0-260128">doubao-seedance-2-0</option>
                        <option value="veo3.1-components">veo 3.1</option>
                        <option value="polo">polo (Gemini Pro)</option>
                    </select>
                </div>

                {/* Mode Select */}
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">参考图模式</span>
                    <select
                        value={refImageMode || 'auto'}
                        onChange={(e) => onUpdate('refImageMode', e.target.value)}
                        className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-purple-500 cursor-pointer"
                    >
                        <option value="auto">参考图 (auto)</option>
                        <option value="first_frame">上传首帧</option>
                        <option value="start_end_frame">首尾帧视频</option>
                    </select>
                </div>

                {/* Connected Reference Images Thumbnails */}
                {connectedImages && connectedImages.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2.5">
                        <span className="text-[10px] text-gray-400 font-bold tracking-wide">
                            参考图像 ({connectedImages.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {connectedImages.map((img, idx) => (
                                <div key={img.nodeId} className="relative group/thumb w-[60px] aspect-square rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
                                    {img.url ? (
                                        <img src={img.url} alt={`Ref ${idx+1}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-[8px] text-gray-500 italic">空</span>
                                    )}
                                    
                                    {/* Order Number Badge */}
                                    <div className="absolute top-0 left-0 bg-purple-500 text-white text-[9px] font-bold px-1 rounded-br-md">
                                        {idx + 1}
                                    </div>

                                    {/* Label for Start/End Frame if start/end frame mode is on */}
                                    {refImageMode === 'start_end_frame' && (
                                        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] text-center py-0.5 font-medium scale-[0.9]">
                                            {idx === 0 ? '首帧' : idx === 1 ? '尾帧' : `参考 ${idx+1}`}
                                        </div>
                                    )}
                                    
                                    {/* Disconnect Connection Button */}
                                    {onDisconnectImage && (
                                        <button
                                            onClick={() => onDisconnectImage(img.nodeId)}
                                            className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-bold opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                            title="断开连线"
                                        >
                                            断开
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Read-only / Help tooltip for videoDuration */}
                <div className="flex items-center gap-1.5 text-[9px] text-gray-400 bg-white/5 border border-white/5 rounded-lg px-2.5 py-1.5 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <span>
                        <b>播放时长</b>：自动从提示词提取时间轴（如 `0-6s`），无标识默认兜底为 8 秒。
                    </span>
                </div>
            </div>

            {/* Video Action Prompt — wrapped to prevent React Flow from intercepting keyboard events */}
            <div className="flex flex-col gap-1 border-t border-white/5 pt-3">
                <span className="text-[10px] text-gray-400 font-bold tracking-wide">镜头动作描述 (Prompt)</span>
                <div className="nowheel nopan nodrag" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <MentionTextarea
                        value={video_prompt || ''}
                        onChange={(val) => onUpdate('video_prompt', val)}
                        onBlur={onBlur}
                        assets={assets || []}
                        sceneImages={sceneImages || []}
                        referencedAssetIds={[]}
                        onMention={() => { }}
                        onUnmention={() => { }}
                        mode="video"
                        placeholder="输入镜头运动调度，输入 @ 触发提示..."
                        className="flex-1 w-full p-2 bg-[#16161a] border border-white/10 rounded-xl text-xs outline-none focus:border-purple-500 min-h-[70px] max-h-[120px]"
                    />
                </div>
            </div>

            {/* Audio Fields */}
            <div className="flex flex-col gap-3 border-t border-white/5 pt-3 nowheel nopan nodrag" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">环境音效 (SFX)</span>
                    <input
                        type="text"
                        value={audio_sfx || ''}
                        onChange={(e) => onUpdate('audio_sfx', e.target.value)}
                        placeholder="输入SFX，如 (雨声, 远处的雷鸣)"
                        className="w-full text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-purple-500"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">背景音乐 (BGM)</span>
                    <input
                        type="text"
                        value={audio_bgm || ''}
                        onChange={(e) => onUpdate('audio_bgm', e.target.value)}
                        placeholder="输入BGM，如 (低沉大提琴, 悲伤钢琴)"
                        className="w-full text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-purple-500"
                    />
                </div>
            </div>

            {/* Generate Trigger Button */}
            <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-500 shadow-md shadow-purple-500/10 hover:shadow-purple-500/25 active:scale-[0.98] transition-all mt-1"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>生成视频中...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>生成电影视频</span>
                    </>
                )}
            </button>

            {id !== 'video-prompt' && onApply && (
                <button
                    onClick={onApply}
                    disabled={isMainGenerating || isSelfGenerating || isGenerating}
                    className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all mt-1 border
                        ${(isMainGenerating || isSelfGenerating || isGenerating)
                            ? 'bg-gray-800/50 border-white/5 text-gray-500 cursor-not-allowed opacity-50'
                            : 'text-gray-200 border-purple-500/30 hover:border-purple-400 bg-purple-500/5 hover:bg-purple-500/10 active:scale-[0.98]'}`}
                >
                    应用为主版本
                </button>
            )}

            {/* Source handle: outputs the generated video result */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                className="w-2.5 h-2.5 bg-purple-500 border-2 border-slate-900 rounded-full !right-[-5px]"
            />
        </div>
    );
};
