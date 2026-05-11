import React, { useState } from 'react';
import { Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { User, MapPin, Package, Plus, Trash2, Wand2, Image as ImageIcon, Camera, RefreshCw, Download, ChevronRight, CornerDownRight, Copy, Maximize2, X, Video } from 'lucide-react';

export interface AssetRowProps {
    asset: Asset;
    depth: number;
    hasChildren: boolean;
    childrenCount: number;
    isExpanded: boolean;
    isGenerating: boolean;
    isReversing?: boolean;
    labels: Translation;
    onUpdateAsset: (asset: Asset) => void;
    onAddVariant: (id: string) => void;
    onDeleteAsset: (id: string) => void;
    onToggleExpand: (id: string) => void;
    onGenMetaImage: (asset: Asset, prompt?: string) => void;
    onSaveImage: (url: string, name: string, assetId?: string) => void;
    onGenMultiAngle?: (asset: Asset, targetAngles: string[]) => void;
}

// Simple icon for toggle
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

const AssetRow: React.FC<AssetRowProps> = ({
    asset, depth, hasChildren, childrenCount, isExpanded, isGenerating, isReversing,
    labels, onUpdateAsset, onAddVariant, onDeleteAsset, onToggleExpand,
    onGenMetaImage, onSaveImage, onGenMultiAngle
}) => {
    const [showAnglePicker, setShowAnglePicker] = useState(false);
    const [selectedAngles, setSelectedAngles] = useState<string[]>(['正面', '背面', '左侧', '右侧', '顶部', '底部']);

    return (
        <>
        <div className={`
            relative flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-white/5 
            hover:border-indigo-300 dark:hover:border-banana-500/30 transition-colors group bg-gray-50 dark:bg-black/20
            ${depth > 0 ? 'mt-1 border-l-2 border-l-indigo-300 dark:border-l-banana-500/20' : 'mt-4'}
            ${showAnglePicker ? 'z-50 ring-1 ring-indigo-500/50 dark:ring-banana-500/50' : 'z-10'}
        `} style={{ marginLeft: depth > 0 ? `${depth * 12}px` : 0 }}>

                {/* Visual Branch Guide for Depth > 0 */}
                {depth > 0 && (
                    <CornerDownRight className="absolute -left-4 top-4 w-4 h-4 text-indigo-400 dark:text-banana-500/30" />
                )}

                <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-black/40 rounded border border-gray-300 dark:border-white/5 flex items-center justify-center overflow-hidden relative group/img cursor-pointer">
                        {(asset.refImageUrl || asset.refImageAssetId) ? (
                            <>
                                <LazyMedia
                                    assetId={asset.refImageAssetId}
                                    fallbackUrl={asset.refImageUrl}
                                    type="image"
                                    alt={asset.name}
                                    className="w-full h-full"
                                    imgClassName="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                    <button disabled={isGenerating} onClick={(e) => { e.stopPropagation(); onGenMetaImage(asset); }} title={labels.regenerate} className="p-1 hover:text-indigo-400 dark:hover:text-banana-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"><RefreshCw className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); onSaveImage(asset.refImageUrl!, asset.name, asset.refImageAssetId); }} title={labels.saveImage} className="p-1 hover:text-indigo-400 dark:hover:text-banana-400 text-white"><Download className="w-3 h-3" /></button>
                                </div>
                            </>
                        ) : (
                            asset.type === 'character' ? <User className="w-6 h-6 text-gray-600" /> :
                                asset.type === 'location' ? <MapPin className="w-6 h-6 text-gray-600" /> :
                                    <Package className="w-6 h-6 text-gray-600" />
                        )}

                        {!asset.refImageUrl && (
                            <button
                                onClick={() => onGenMetaImage(asset)}
                                disabled={isGenerating || !asset.description}
                                className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${!asset.refImageUrl ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'}`}
                                title={labels.genRefImage}
                            >
                                {isGenerating ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Camera className="w-5 h-5 text-white/80 hover:text-indigo-400 dark:hover:text-banana-400" />
                                )}
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            const next = asset.type === 'character' ? 'location' : asset.type === 'location' ? 'item' : 'character';
                            onUpdateAsset({ ...asset, type: next });
                        }}
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/5 ${asset.type === 'character' ? 'text-pink-600 dark:text-pink-400' :
                            asset.type === 'location' ? 'text-blue-600 dark:text-blue-400' :
                                'text-amber-600 dark:text-yellow-400'
                            }`}
                    >
                        {asset.type === 'character' ? 'CHAR' : asset.type === 'location' ? 'LOC' : 'ITEM'}
                    </button>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-2 relative">
                        <input
                            type="text"
                            value={asset.name}
                            onChange={(e) => onUpdateAsset({ ...asset, name: e.target.value })}
                            placeholder={labels.assetNamePlaceholder}
                            className="flex-1 bg-transparent border-none text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 dark:focus:ring-banana-500/50 rounded px-1 pr-14"
                        />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-dark-800/80 rounded backdrop-blur-sm">
                            {asset.type === 'location' && onGenMultiAngle && (
                                <div className="relative flex items-center">
                                    <button onClick={() => setShowAnglePicker(!showAnglePicker)} className="text-gray-500 hover:text-indigo-600 dark:hover:text-blue-400 p-1" title="空间方位图">
                                        {isReversing ? <div className="w-3.5 h-3.5 border-2 border-indigo-400 dark:border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                                    </button>
                                    {showAnglePicker && (
                                        <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-lg dark:shadow-2xl p-3 z-50 text-xs cursor-default" onClick={(e) => e.stopPropagation()}>
                                            <div className="font-semibold text-gray-900 dark:text-gray-200 mb-2">空间方位图 (Cubemap)</div>
                                            <div className="grid grid-cols-2 gap-1 mb-3">
                                                {['正面', '背面', '左侧', '右侧', '顶部', '底部'].map(angle => (
                                                    <label key={angle} className="flex items-center gap-1.5 cursor-pointer text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
                                                        <input type="checkbox" className="rounded bg-gray-100 dark:bg-black/30 border-gray-300 dark:border-white/10 text-indigo-600 dark:text-banana-500 focus:ring-indigo-500/50 dark:focus:ring-banana-500/50" checked={selectedAngles.includes(angle)} onChange={(e) => { if (e.target.checked) setSelectedAngles([...selectedAngles, angle]); else setSelectedAngles(selectedAngles.filter(a => a !== angle)); }} />
                                                        {angle}
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setShowAnglePicker(false)} className="px-2 py-1 text-gray-500 hover:text-gray-900 bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:bg-white/5 rounded">取消</button>
                                                <button onClick={() => { if (selectedAngles.length > 0 && onGenMultiAngle) { onGenMultiAngle(asset, selectedAngles); setShowAnglePicker(false); } }} disabled={selectedAngles.length === 0} className="px-2 py-1 text-white dark:text-black bg-indigo-600 dark:bg-banana-500 hover:bg-indigo-700 dark:hover:bg-banana-400 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed">生成</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={() => onAddVariant(asset.id)} className="text-gray-500 hover:text-indigo-600 dark:hover:text-banana-400 p-1" title="Add Variant">
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => onDeleteAsset(asset.id)} className="text-gray-500 hover:text-red-500 dark:hover:text-red-400 p-1">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mb-1 select-all cursor-pointer flex items-center gap-2">

                        {hasChildren && (
                            <button onClick={() => onToggleExpand(asset.id)} className="flex items-center gap-1 text-indigo-600 dark:text-banana-500 hover:text-indigo-700 dark:hover:text-banana-400">
                                {isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {childrenCount} Variants
                            </button>
                        )}
                    </div>
                    <textarea
                        value={asset.description}
                        onChange={(e) => onUpdateAsset({ ...asset, description: e.target.value, prompt: undefined })}
                        placeholder={labels.assetDescPlaceholder}
                        rows={3}
                        className="w-full bg-white dark:bg-black/30 text-gray-800 dark:text-gray-300 text-xs p-2 rounded border border-gray-200 dark:border-white/5 resize-none focus:outline-none focus:border-indigo-500/30 dark:focus:border-banana-500/30 scrollbar-thin"
                    />



                    <div className="mt-1 flex justify-end">
                        <label className="text-[10px] text-gray-500 hover:text-indigo-600 dark:hover:text-banana-400 cursor-pointer flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> Update Image
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => onUpdateAsset({ ...asset, refImageUrl: ev.target?.result as string });
                                    reader.readAsDataURL(file);
                                }
                            }} />
                        </label>
                    </div>
                </div>
            </div>


        </>
    );
};

export default AssetRow;

