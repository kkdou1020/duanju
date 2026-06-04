import React, { useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon, Upload, Download, Trash2, Loader2 } from 'lucide-react';
import { ImageGenStatus } from '@/shared/types';

interface ImageOutputNodeProps {
    data: {
        imageUrl?: string;
        imageAssetId?: string;
        genStatus: ImageGenStatus;
        onUpload: (file: File) => void;
        onDelete: () => void;
        onDownload: () => void;
    };
}

export const ImageOutputNode: React.FC<ImageOutputNodeProps> = ({ data }) => {
    const { imageUrl, genStatus, onUpload, onDelete, onDownload } = data;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
    };

    const isGenerating = genStatus === ImageGenStatus.GENERATING;

    return (
        <div className="relative flex flex-col gap-3 p-3.5 rounded-2xl border border-pink-500/30 bg-[#0e0e11]/90 shadow-2xl shadow-pink-500/5 w-[220px]">
            {/* Input from ImagePromptNode */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="w-2.5 h-2.5 bg-pink-500 border-2 border-slate-900 rounded-full !left-[-5px]"
            />

            {/* Hidden upload input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />

            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <ImageIcon className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-bold text-gray-100 tracking-wider">图片输出节点</span>
            </div>

            {/* Media Area */}
            <div className="w-full aspect-video rounded-xl bg-black/60 border border-white/5 flex flex-col items-center justify-center overflow-hidden relative group">
                {isGenerating ? (
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
                        <span className="text-[9px] text-pink-400 font-medium">生成分镜图中...</span>
                    </div>
                ) : imageUrl ? (
                    <>
                        <img
                            src={imageUrl}
                            alt="Output"
                            className="w-full h-full object-cover"
                        />
                        {/* Hover Overlay Toolbar */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                                title="覆盖上传"
                            >
                                <Upload className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onDownload}
                                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                                title="保存下载"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full transition-colors border border-red-500/20"
                                title="删除图片"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                            <ImageIcon className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] text-gray-400 leading-snug">等待生图输出</span>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[9px] font-semibold text-gray-300 transition-all flex items-center gap-1 mt-1"
                        >
                            <Upload className="w-3 h-3" />
                            上传图片
                        </button>
                    </div>
                )}
            </div>

            {/* Output to VideoPromptNode */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                className="w-2.5 h-2.5 bg-pink-500 border-2 border-slate-900 rounded-full !right-[-5px]"
            />
        </div>
    );
};
