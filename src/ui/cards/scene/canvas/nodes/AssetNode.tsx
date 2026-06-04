import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, MapPin, Box, Video, Music } from 'lucide-react';
import { Asset } from '@/shared/types';

interface AssetNodeProps {
    data: {
        asset: Asset;
    };
}

export const AssetNode: React.FC<AssetNodeProps> = ({ data }) => {
    const { asset } = data;

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

    const getBgColor = () => {
        switch (asset.type) {
            case 'character': return 'from-cyan-950/40 to-slate-900 border-cyan-500/20';
            case 'location': return 'from-emerald-950/40 to-slate-900 border-emerald-500/20';
            case 'item': return 'from-amber-950/40 to-slate-900 border-amber-500/20';
            case 'video': return 'from-purple-950/40 to-slate-900 border-purple-500/20';
            case 'audio': return 'from-pink-950/40 to-slate-900 border-pink-500/20';
            default: return 'from-slate-900 to-slate-950 border-white/5';
        }
    };

    const getThumbnailUrl = () => {
        return asset.refImageUrl || asset.refVideoUrl || undefined;
    };

    const isMedia = asset.type === 'video' || asset.type === 'audio';
    const thumbUrl = getThumbnailUrl();

    return (
        <div className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-gradient-to-r shadow-lg ${getBgColor()} w-[180px]`}>
            {/* Left Type Icon / Thumbnail */}
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden">
                {thumbUrl && asset.type !== 'audio' ? (
                    asset.type === 'video' ? (
                        <video src={thumbUrl} className="w-full h-full object-cover pointer-events-none" muted />
                    ) : (
                        <img src={thumbUrl} alt={asset.name} className="w-full h-full object-cover pointer-events-none" />
                    )
                ) : (
                    getIcon()
                )}
            </div>

            {/* Content Details */}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-100 truncate">{asset.name}</p>
                <span className="text-[9px] text-gray-400 font-medium tracking-wider uppercase">
                    {asset.type === 'character' ? '角色' : 
                     asset.type === 'location' ? '场景' : 
                     asset.type === 'item' ? '道具' : 
                     asset.type === 'video' ? '视频资产' : '音频资产'}
                </span>
            </div>

            {/* Right Output Connector */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                className="w-2.5 h-2.5 bg-cyan-400 border-2 border-slate-900 rounded-full !right-[-5px]"
            />
        </div>
    );
};
