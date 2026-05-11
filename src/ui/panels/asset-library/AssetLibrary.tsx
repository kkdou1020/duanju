import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Asset, GlobalStyle } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Virtuoso } from 'react-virtuoso';
import { Plus, Wand2, Camera, Upload, Package, Pause } from 'lucide-react';
import { generateAssetImage } from '@/services/ai';
import { loadAssetUrl, loadAssetBase64 } from '@/services/storage';
import { reverseEngineerAngles } from '@/services/api';
import AssetRow from './AssetRow';

interface AssetLibraryProps {
    assets: Asset[];
    onUpdateAsset: (asset: Asset) => void;
    onAddAsset: (asset: Asset) => void;
    onDeleteAsset: (id: string) => void;
    onExtract: () => void;
    isExtracting: boolean;
    labels: Translation;
    hasText: boolean;
    currentStyle: GlobalStyle;
    autoStart?: boolean;
    onBatchComplete?: () => void;
    onImportFromGlobal?: () => void;
    language?: string;
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({
    assets, onUpdateAsset, onAddAsset, onDeleteAsset,
    onExtract, isExtracting, labels, hasText, currentStyle,
    autoStart = false, onBatchComplete, onImportFromGlobal, language = "English"
}) => {
    const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [reversingIds, setReversingIds] = useState<Set<string>>(new Set());
    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const stopBatchRef = useRef(false);

    // Auto-start mechanism
    useEffect(() => {
        if (autoStart && !isBatchGenerating) {
            const t = setTimeout(() => {
                handleBatchGenerate();
            }, 500);
            return () => clearTimeout(t);
        }
    }, [autoStart]);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const addAsset = (parentId?: string, parentIdString?: string) => {
        const baseId = parentIdString || `custom_${Date.now()}`;
        const newId = parentId ? `${baseId}_variant_${Date.now()}` : baseId;
        const newAsset: Asset = {
            id: newId,
            name: '',
            description: '',
            type: 'character',
            parentId: parentId
        };
        onAddAsset(newAsset);
        if (parentId) {
            const newSet = new Set(expandedIds);
            newSet.add(parentId);
            setExpandedIds(newSet);
        }
    };

    const handleGenMetaImage = async (asset: Asset, overridePrompt?: string) => {
        setGeneratingIds(prev => {
            const next = new Set(prev);
            next.add(asset.id);
            return next;
        });
        try {
            const parentAsset = asset.parentId ? assets.find(a => a.id === asset.parentId) : undefined;
            let referenceImage = parentAsset?.refImageUrl;
            if (!referenceImage && parentAsset?.refImageAssetId) {
                referenceImage = await loadAssetBase64(parentAsset.refImageAssetId) || undefined;
            }
            if (referenceImage && referenceImage.startsWith('blob:')) {
                // If by any chance refImageUrl is a blob URL, we need to load base64 instead
                if (parentAsset?.refImageAssetId) {
                    referenceImage = await loadAssetBase64(parentAsset.refImageAssetId) || undefined;
                } else {
                    // Fallback to fetch blob and convert to base64
                    try {
                        const res = await fetch(referenceImage);
                        const blob = await res.blob();
                        referenceImage = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        }) || undefined;
                    } catch (e) {
                        console.error('Failed to convert blob to base64', e);
                    }
                }
            }
            const { imageUrl, prompt } = await generateAssetImage(asset, currentStyle, overridePrompt, referenceImage);
            onUpdateAsset({ ...asset, refImageUrl: imageUrl, prompt });
        } catch (e) {
            console.error("Meta Image Error", e);
        } finally {
            setGeneratingIds(prev => {
                const next = new Set(prev);
                next.delete(asset.id);
                return next;
            });
        }
    };

    const handleBatchGenerate = async () => {
        if (isBatchGenerating) {
            stopBatchRef.current = true;
            return;
        }

        const missing = assets.filter(a => {
            if (a.refImageUrl || a.refImageAssetId || !a.description) return false;
            if (a.parentId) {
                const parent = assets.find(p => p.id === a.parentId);
                if (parent && !parent.refImageUrl && !parent.refImageAssetId) {
                    return false;
                }
            }
            return true;
        });
        if (missing.length === 0) {
            if (onBatchComplete && !stopBatchRef.current) {
                onBatchComplete();
            }
            return;
        }

        setIsBatchGenerating(true);
        stopBatchRef.current = false;

        const concurrency = 10;
        let index = 0;

        const runNext = async (): Promise<void> => {
            if (stopBatchRef.current) return;
            const asset = missing[index++];
            if (!asset) return;

            setGeneratingIds(prev => {
                const next = new Set(prev);
                next.add(asset.id);
                return next;
            });
            try {
                const parentAsset = asset.parentId ? assets.find(a => a.id === asset.parentId) : undefined;
                let referenceImage = parentAsset?.refImageUrl;
                if (!referenceImage && parentAsset?.refImageAssetId) {
                    referenceImage = await loadAssetBase64(parentAsset.refImageAssetId) || undefined;
                }
                if (referenceImage && referenceImage.startsWith('blob:')) {
                    if (parentAsset?.refImageAssetId) {
                        referenceImage = await loadAssetBase64(parentAsset.refImageAssetId) || undefined;
                    } else {
                        try {
                            const res = await fetch(referenceImage);
                            const blob = await res.blob();
                            referenceImage = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            }) || undefined;
                        } catch (e) {
                            console.error('Failed to convert blob to base64', e);
                        }
                    }
                }
                const { imageUrl, prompt } = await generateAssetImage(asset, currentStyle, undefined, referenceImage);
                onUpdateAsset({ ...asset, refImageUrl: imageUrl, prompt });
            } catch (e) {
                console.error(`Failed to gen image for ${asset.name}`, e);
            } finally {
                setGeneratingIds(prev => {
                    const next = new Set(prev);
                    next.delete(asset.id);
                    return next;
                });
            }

            if (!stopBatchRef.current) {
                await runNext();
            }
        };

        try {
            const workers: Promise<void>[] = [];
            const workerCount = Math.min(concurrency, missing.length);
            for (let i = 0; i < workerCount; i++) {
                workers.push(runNext());
            }
            await Promise.all(workers);
        } finally {
            setIsBatchGenerating(false);
            if (onBatchComplete && !stopBatchRef.current) {
                onBatchComplete();
            }
        }
    };

    const handleGenMultiAngle = async (asset: Asset, targetAngles: string[]) => {
        if (!asset.description) return;
        setReversingIds(prev => {
            const next = new Set(prev);
            next.add(asset.id);
            return next;
        });

        try {
            let referenceImage = asset.refImageUrl;
            if (!referenceImage && asset.refImageAssetId) {
                referenceImage = await loadAssetBase64(asset.refImageAssetId) || undefined;
            }

            const { result } = await reverseEngineerAngles(asset.description, targetAngles, referenceImage, language);
            
            if (result && Array.isArray(result)) {
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    next.add(asset.id);
                    return next;
                });

                result.forEach((item, index) => {
                    const newId = `${asset.id}_angle_${Date.now()}_${index}`;
                    const newAsset: Asset = {
                        id: newId,
                        name: `${asset.name} - ${item.angle}`,
                        description: item.description,
                        type: 'location',
                        parentId: asset.id
                    };
                    onAddAsset(newAsset);
                });
            }
        } catch (e) {
            console.error("Failed to reverse engineer angles:", e);
            alert("反推生成失败，请重试。" + (e as any)?.message);
        } finally {
            setReversingIds(prev => {
                const next = new Set(prev);
                next.delete(asset.id);
                return next;
            });
        }
    };

    const handleSaveImage = async (url: string, name: string, assetId?: string) => {
        try {
            let href = url;
            if (!href && assetId) {
                const loaded = await loadAssetUrl(assetId);
                if (loaded) href = loaded;
            }
            if (!href) return;
            if (!href.startsWith('data:')) {
                const response = await fetch(href);
                const blob = await response.blob();
                href = URL.createObjectURL(blob);
            }
            const link = document.createElement('a');
            link.href = href;
            link.download = `asset_${name}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (href !== url) {
                URL.revokeObjectURL(href);
            }
        } catch (e) {
            console.error("Failed to download asset image", e);
            if (url) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `asset_${name}.png`;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleUploadAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const imageUrl = ev.target?.result as string;
            const newAsset: Asset = {
                id: `upload_${Date.now()}`,
                name: file.name.split('.')[0],
                description: 'Uploaded asset',
                type: 'character',
                refImageUrl: imageUrl
            };
            onAddAsset(newAsset);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // Flatten assets for virtualization
    const assetIds = new Set(assets.map(a => a.id));
    const rootAssets = assets.filter(a => !a.parentId || !assetIds.has(a.parentId));

    const flatAssets = useMemo(() => {
        const result: { asset: Asset; depth: number }[] = [];
        const traverse = (asset: Asset, depth: number) => {
            result.push({ asset, depth });
            if (expandedIds.has(asset.id)) {
                const children = assets.filter(a => a.parentId === asset.id);
                children.forEach(child => traverse(child, depth + 1));
            }
        };
        rootAssets.forEach(root => traverse(root, 0));
        return result;
    }, [assets, expandedIds, rootAssets]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-800 border-x border-b border-gray-200 dark:border-white/10 rounded-b-xl overflow-hidden shadow-sm dark:shadow-xl transition-colors duration-300">
            <div className="bg-gray-50 dark:bg-white/5 p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-300 tracking-wider flex items-center gap-2">
                    {labels.assetsTitle}
                    <span className="bg-indigo-100 dark:bg-banana-500/20 text-indigo-600 dark:text-banana-500 text-[10px] px-1.5 py-0.5 rounded-full">{assets.length}</span>
                </h2>
                <div className="flex gap-2">
                    <label className="p-1.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg text-gray-500 dark:text-gray-300 transition-colors cursor-pointer" title="Upload Asset">
                        <Upload className="w-4 h-4" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleUploadAsset} />
                    </label>
                    <button onClick={handleBatchGenerate} className={`p-1.5 rounded-lg transition-colors ${isBatchGenerating ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black hover:bg-indigo-700 dark:hover:bg-banana-400' : 'bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-500 dark:text-gray-300'}`} title={isBatchGenerating ? "暂停生成" : labels.genMissing}>
                        {isBatchGenerating ? <Pause className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                    </button>
                    {onImportFromGlobal && (
                        <button onClick={onImportFromGlobal} className="p-1.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg text-gray-500 dark:text-gray-300 transition-colors" title="Add Reference Image">
                            <Package className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => addAsset()} className="p-1.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg text-gray-500 dark:text-gray-300 transition-colors" title={labels.addAsset}>
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <Virtuoso
                    data={flatAssets}
                    components={{
                        Header: () => (
                            <div className="p-4 pb-0">
                                <div className="bg-gradient-to-br from-indigo-50 dark:from-banana-900/20 to-transparent p-4 rounded-xl border border-indigo-100 dark:border-banana-500/20 text-center mb-4">
                                    <p className="text-xs text-indigo-600/70 dark:text-banana-100/70 mb-3">{labels.autoExtractTip}</p>
                                    <button
                                        onClick={onExtract}
                                        disabled={isExtracting || !hasText}
                                        className={`w-full py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${isExtracting || !hasText ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'bg-indigo-600 dark:bg-banana-500 hover:bg-indigo-700 dark:hover:bg-banana-400 text-white dark:text-dark-900 shadow-lg shadow-indigo-500/20 dark:shadow-banana-500/20'}`}
                                    >
                                        {isExtracting ? <><div className="w-4 h-4 border-2 border-white dark:border-dark-900 border-t-transparent rounded-full animate-spin" />{labels.extracting}</> : <><Wand2 className="w-4 h-4" />✨ {labels.extractAssets}</>}
                                    </button>
                                </div>
                                {assets.length === 0 && !isExtracting && <div className="text-center py-8 text-gray-400 dark:text-gray-600 text-xs italic">{labels.noAssets}</div>}
                            </div>
                        ),
                        Footer: () => <div className="h-4" />
                    }}
                    itemContent={(index, item) => {
                        const childrenCount = assets.filter(a => a.parentId === item.asset.id).length;
                        const hasChildren = childrenCount > 0;
                        const isExpanded = expandedIds.has(item.asset.id);
                        return (
                            <div className="px-4 pb-1">
                                <AssetRow
                                    asset={item.asset}
                                    depth={item.depth}
                                    hasChildren={hasChildren}
                                    childrenCount={childrenCount}
                                    isExpanded={isExpanded}
                                    isGenerating={generatingIds.has(item.asset.id)}
                                    labels={labels}
                                    onUpdateAsset={onUpdateAsset}
                                    onAddVariant={(id) => addAsset(id, id)}
                                    onDeleteAsset={onDeleteAsset}
                                    onToggleExpand={toggleExpand}
                                    onGenMetaImage={handleGenMetaImage}
                                    onSaveImage={handleSaveImage}
                                    onGenMultiAngle={handleGenMultiAngle}
                                    isReversing={reversingIds.has(item.asset.id)}
                                />
                            </div>
                        )
                    }}
                />
            </div>
        </div>
    );
};

export default AssetLibrary;
