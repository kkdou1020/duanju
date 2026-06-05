import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Film } from 'lucide-react';
import { Scene } from '@/shared/types';
import { loadAssetBase64 } from '@/services/storage';

interface SceneRefNodeProps {
    data: {
        scene: Scene;
        optionId?: string;
    };
}

export const SceneRefNode: React.FC<SceneRefNodeProps> = ({ data }) => {
    const { scene, optionId } = data;

    // Resolve specific option if specified
    const option = optionId && scene.prompt_options ? scene.prompt_options.find(o => o.option_id === optionId) : null;
    const imageUrl = option ? option.imageUrl : scene.imageUrl;
    const imageAssetId = option ? option.imageAssetId : scene.imageAssetId;
    const displayName = option ? `分镜 ${scene.id}-${optionId}` : `分镜 ${scene.id}`;

    const [resolvedUrl, setResolvedUrl] = useState(imageUrl);

    useEffect(() => {
        setResolvedUrl(imageUrl);
    }, [imageUrl]);

    useEffect(() => {
        if (!imageAssetId) return;
        let cancelled = false;
        loadAssetBase64(imageAssetId)
            .then((base64) => {
                if (base64 && !cancelled) {
                    setResolvedUrl(base64);
                }
            })
            .catch((e) => {
                console.error(`Failed to load SceneRefNode image ${imageAssetId} from storage:`, e);
            });
        return () => {
            cancelled = true;
        };
    }, [imageAssetId]);

    return (
        <div className="relative flex flex-col gap-1.5 p-2 rounded-xl border border-white/10 bg-[#16161a] hover:border-cyan-500/30 transition-colors shadow-xl w-[150px]">
            {/* Header Title */}
            <div className="flex items-center gap-1.5 min-w-0">
                <Film className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-gray-200 truncate">{displayName}</span>
            </div>

            {/* Thumbnail Image Box */}
            <div className="w-full aspect-video rounded-lg bg-black/60 border border-white/5 flex items-center justify-center overflow-hidden">
                {resolvedUrl ? (
                    <img src={resolvedUrl} alt={displayName} className="w-full h-full object-cover pointer-events-none" />
                ) : (
                    <span className="text-[9px] text-gray-500 italic">未生成分镜图</span>
                )}
            </div>

            {/* Snippet Description */}
            <div className="text-[9px] text-gray-400 line-clamp-2 leading-snug">
                {scene.narration || scene.visual_desc || '暂无内容'}
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
