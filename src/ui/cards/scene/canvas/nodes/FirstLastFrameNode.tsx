import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon, Film, Loader2, Sparkles, Download, Eye, RefreshCw } from 'lucide-react';
import { loadAssetUrl } from '@/services/storage';

interface FirstLastFrameNodeProps {
    data: {
        videoUrl?: string;
        videoAssetId?: string;
        startImageUrl?: string;
        startImageAssetId?: string;
        endImageUrl?: string;
        endImageAssetId?: string;
        onExtract?: (timeType: 'start' | 'end') => Promise<void> | void;
    };
}

export const FirstLastFrameNode: React.FC<FirstLastFrameNodeProps> = ({ data }) => {
    const { 
        videoUrl, 
        startImageUrl: propStartImageUrl, 
        startImageAssetId,
        endImageUrl: propEndImageUrl, 
        endImageAssetId,
        onExtract 
    } = data;

    const [startUrl, setStartUrl] = useState(propStartImageUrl);
    const [endUrl, setEndUrl] = useState(propEndImageUrl);
    const [extracting, setExtracting] = useState<'start' | 'end' | null>(null);

    const isConnected = !!videoUrl;

    // Sync startUrl state with prop updates
    useEffect(() => {
        setStartUrl(propStartImageUrl);
    }, [propStartImageUrl]);

    // Sync endUrl state with prop updates
    useEffect(() => {
        setEndUrl(propEndImageUrl);
    }, [propEndImageUrl]);

    // Dynamically resolve start frame image from IndexedDB if ID is present but url is missing or broken
    useEffect(() => {
        if (!startImageAssetId) return;
        let cancelled = false;
        const load = async () => {
            try {
                const resolvedUrl = await loadAssetUrl(startImageAssetId);
                if (resolvedUrl && !cancelled) {
                    setStartUrl(resolvedUrl);
                }
            } catch (e) {
                console.error("Failed to load start frame asset image:", e);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [startImageAssetId]);

    // Dynamically resolve end frame image from IndexedDB if ID is present but url is missing or broken
    useEffect(() => {
        if (!endImageAssetId) return;
        let cancelled = false;
        const load = async () => {
            try {
                const resolvedUrl = await loadAssetUrl(endImageAssetId);
                if (resolvedUrl && !cancelled) {
                    setEndUrl(resolvedUrl);
                }
            } catch (e) {
                console.error("Failed to load end frame asset image:", e);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [endImageAssetId]);

    const handleExtract = async (timeType: 'start' | 'end') => {
        if (!isConnected) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "未连接上游视频源，请先连接视频源",
                    type: 'warning'
                }
            }));
            return;
        }
        if (!onExtract) return;
        setExtracting(timeType);
        try {
            await onExtract(timeType);
        } catch (e) {
            console.error(e);
        } finally {
            setExtracting(null);
        }
    };

    return (
        <div className="relative flex flex-col gap-3 p-3.5 rounded-2xl border border-yellow-500/30 bg-[#0e0e11]/90 shadow-2xl shadow-yellow-500/5 w-[260px]">
            {/* Input from Video Source */}
            <Handle
                type="target"
                position={Position.Left}
                id="target-video"
                className="w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-900 rounded-full !left-[-5px]"
                title="连接视频源"
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold text-gray-100 tracking-wider">首尾帧获取</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-500/80 border border-yellow-500/20'
                }`}>
                    {isConnected ? '已连接视频' : '未连接视频'}
                </span>
            </div>

            {/* Content Area - Previews side by side */}
            <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold px-0.5">
                    <span>|&lt; 首帧</span>
                    <span>尾帧 &gt;|</span>
                </div>

                <div className="flex gap-2">
                    {/* First Frame Box */}
                    <div className="flex-1 aspect-[4/3] rounded-lg bg-black/40 border border-white/10 overflow-hidden flex flex-col items-center justify-center relative group/frame">
                        {extracting === 'start' ? (
                            <div className="flex flex-col items-center gap-1">
                                <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                                <span className="text-[8px] text-gray-500 font-medium">提取中...</span>
                            </div>
                        ) : startUrl ? (
                            <>
                                <img src={startUrl} alt="Start Frame" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover/frame:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-10">
                                    <button
                                        onClick={() => handleExtract('start')}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-yellow-400 rounded transition-colors"
                                        title="重新获取首帧"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => window.open(startUrl, '_blank')}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                                        title="查看大图"
                                    >
                                        <Eye className="w-3 h-3" />
                                    </button>
                                    <a
                                        href={startUrl}
                                        download="start_frame.png"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors flex items-center"
                                        title="下载图片"
                                    >
                                        <Download className="w-3 h-3" />
                                    </a>
                                </div>
                            </>
                        ) : (
                            <button
                                onClick={() => handleExtract('start')}
                                className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:scale-95 transition-all text-gray-400 hover:text-yellow-400"
                            >
                                <Sparkles className="w-4 h-4 stroke-[1.5]" />
                                <span className="text-[9px] font-bold">获取首帧</span>
                            </button>
                        )}
                    </div>

                    {/* Last Frame Box */}
                    <div className="flex-1 aspect-[4/3] rounded-lg bg-black/40 border border-white/10 overflow-hidden flex flex-col items-center justify-center relative group/frame">
                        {extracting === 'end' ? (
                            <div className="flex flex-col items-center gap-1">
                                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                                <span className="text-[8px] text-gray-500 font-medium">提取中...</span>
                            </div>
                        ) : endUrl ? (
                            <>
                                <img src={endUrl} alt="End Frame" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover/frame:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-10">
                                    <button
                                        onClick={() => handleExtract('end')}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-purple-400 rounded transition-colors"
                                        title="重新获取尾帧"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => window.open(endUrl, '_blank')}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                                        title="查看大图"
                                    >
                                        <Eye className="w-3 h-3" />
                                    </button>
                                    <a
                                        href={endUrl}
                                        download="end_frame.png"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors flex items-center"
                                        title="下载图片"
                                    >
                                        <Download className="w-3 h-3" />
                                    </a>
                                </div>
                            </>
                        ) : (
                            <button
                                onClick={() => handleExtract('end')}
                                className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:scale-95 transition-all text-gray-400 hover:text-purple-400"
                            >
                                <Sparkles className="w-4 h-4 stroke-[1.5]" />
                                <span className="text-[9px] font-bold">获取尾帧</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
