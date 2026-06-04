import React, { useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Film, Download, Trash2, Loader2, Upload, Image } from 'lucide-react';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { ImageGenStatus } from '@/shared/types';

interface VideoOutputNodeProps {
    data: {
        videoUrl?: string;
        videoAssetId?: string;
        videoStatus: ImageGenStatus;
        onUpload: (file: File) => void;
        onDelete: () => void;
        onDownload: () => void;
        onExtractFrame?: (timeType: 'start' | 'end') => void;
    };
}

export const VideoOutputNode: React.FC<VideoOutputNodeProps> = ({ data }) => {
    const { videoUrl, videoAssetId, videoStatus, onUpload, onDelete, onDownload } = data;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
    };

    const isGenerating = videoStatus === ImageGenStatus.GENERATING;

    return (
        <div className="relative flex flex-col gap-3 p-3.5 rounded-2xl border border-purple-500/30 bg-[#0e0e11]/90 shadow-2xl shadow-purple-500/5 w-[220px]">
            {/* Input from VideoPromptNode */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="w-2.5 h-2.5 bg-purple-500 border-2 border-slate-900 rounded-full !left-[-5px]"
            />

            {/* Hidden upload input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="video/*"
                className="hidden"
            />

            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <Film className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-gray-100 tracking-wider">视频输出节点</span>
            </div>

            {/* Media Area */}
            <div className="w-full aspect-video rounded-xl bg-black/60 border border-white/5 flex flex-col items-center justify-center overflow-hidden relative group">
                {isGenerating ? (
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                        <span className="text-[9px] text-purple-400 font-medium">生成视频中...</span>
                    </div>
                ) : videoUrl ? (
                    <>
                        <div className="w-full h-full relative">
                            <LazyMedia
                                assetId={videoAssetId}
                                fallbackUrl={videoUrl}
                                type="video"
                                controls
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {/* Hover Overlay Toolbar */}
                        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                                title="覆盖上传视频"
                            >
                                <Upload className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onDownload}
                                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                                title="保存下载视频"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full transition-colors border border-red-500/20"
                                title="删除视频"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                            <Film className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] text-gray-400 leading-snug">等待视频输出</span>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[9px] font-semibold text-gray-300 transition-all flex items-center gap-1 mt-1"
                        >
                            <Upload className="w-3 h-3" />
                            上传视频
                        </button>
                    </div>
                )}
            </div>

            {/* Output to extracted image cards */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                className="w-2.5 h-2.5 bg-purple-500 border-2 border-slate-900 rounded-full !right-[-5px]"
            />
        </div>
    );
};
