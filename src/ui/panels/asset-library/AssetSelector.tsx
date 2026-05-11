import React, { useRef } from 'react';
import { Asset } from '@/shared/types';
import { X, Search, Upload } from 'lucide-react';
import { LazyMedia } from '@/ui/common/LazyMedia';

interface AssetSelectorProps {
    assets: Asset[];
    onSelect: (assetId: string | string[], asset?: Asset | Asset[]) => void;
    onClose: () => void;
    onAssetCreated?: (asset: Asset | Asset[]) => void;
    selectedIds?: string[];
    extraAssets?: Asset[]; // New prop for temporary assets like current scene image
    sceneImages?: Asset[]; // New prop for chapter scene images
    allowMultiple?: boolean;
    maxSelections?: number; // Optional limit for selections
    onConfirm?: (selectedIds: string[]) => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
    assets,
    onSelect,
    onClose,
    onAssetCreated,
    selectedIds = [],
    extraAssets = [],
    sceneImages = [],
    allowMultiple = true, // Default to true for better UX
    maxSelections,
    onConfirm
}) => {
    const [activeTab, setActiveTab] = React.useState<'assets' | 'scenes'>('assets');
    const [search, setSearch] = React.useState('');
    const [pendingUploads, setPendingUploads] = React.useState<{ base64: string; name: string }[]>([]);
    const [currentUploadIdx, setCurrentUploadIdx] = React.useState<number>(0);
    const [createdAssets, setCreatedAssets] = React.useState<Asset[]>([]);
    const [newAssetInfo, setNewAssetInfo] = React.useState<{ name: string; description: string; type: Asset['type'] }>({
        name: '',
        description: '',
        type: 'character'
    });
    const [multiSelection, setMultiSelection] = React.useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentTabAssets = activeTab === 'assets'
        ? [...extraAssets, ...assets]
        : sceneImages;

    const filteredAssets = currentTabAssets.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase())
    );

    const toggleSelection = (id: string) => {
        const next = new Set(multiSelection);
        if (next.has(id)) {
            next.delete(id);
        } else {
            // Check limit
            if (maxSelections && (selectedIds.length + next.size >= maxSelections)) {
                alert(`Maximum ${maxSelections} items allowed.`);
                return;
            }
            next.add(id);
        }
        setMultiSelection(next);
    };

    const handleConfirmSelection = () => {
        const selectedArr = Array.from(multiSelection);
        const selectedAssets = [...extraAssets, ...assets, ...sceneImages].filter(a => selectedArr.includes(a.id));
        if (onConfirm) {
            onConfirm(selectedArr);
        } else {
            onSelect(selectedArr, selectedAssets);
        }
    };

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Validation: Check Max Selections if applicable
        if (maxSelections && (selectedIds.length + multiSelection.size + files.length > maxSelections)) {
            alert(`Adding these files would exceed the limit of ${maxSelections} total references.`);
            e.target.value = '';
            return;
        }

        const fileList = Array.from(files);
        const newUploads: { base64: string; name: string }[] = [];
        let processed = 0;

        fileList.forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                newUploads.push({ base64, name: file.name.split('.')[0] });
                processed++;
                if (processed === fileList.length) {
                    setPendingUploads(newUploads);
                    setCurrentUploadIdx(0);
                    setCreatedAssets([]);
                    setNewAssetInfo({
                        name: newUploads[0].name,
                        description: '',
                        type: 'character'
                    });
                }
            };
            reader.readAsDataURL(file);
        });

        e.target.value = '';
    };

    const handleConfirmCurrentUpload = () => {
        const current = pendingUploads[currentUploadIdx];
        const newAsset: Asset = {
            id: `custom_${Date.now()}_${currentUploadIdx}`,
            name: newAssetInfo.name || current.name,
            description: newAssetInfo.description || 'Custom uploaded reference image',
            type: newAssetInfo.type,
            refImageUrl: current.base64
        };

        const updatedCreated = [...createdAssets, newAsset];
        setCreatedAssets(updatedCreated);

        if (currentUploadIdx < pendingUploads.length - 1) {
            const nextIdx = currentUploadIdx + 1;
            setCurrentUploadIdx(nextIdx);
            setNewAssetInfo({
                name: pendingUploads[nextIdx].name,
                description: '',
                type: 'character'
            });
        } else {
            // All done
            if (onAssetCreated) {
                onAssetCreated(updatedCreated);
                onSelect(updatedCreated.map(a => a.id), updatedCreated);
            }
            setPendingUploads([]);
            setCreatedAssets([]);
        }
    };

    if (pendingUploads.length > 0) {
        const current = pendingUploads[currentUploadIdx];
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">New Asset ({currentUploadIdx + 1}/{pendingUploads.length})</h3>
                        <span className="text-xs text-gray-500 font-mono">{current.name}</span>
                    </div>

                    <div className="flex justify-center bg-gray-100 dark:bg-black/40 rounded-lg p-4 border border-gray-200 dark:border-white/5">
                        <img src={current.base64} alt="Preview" className="h-40 object-contain rounded" />
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Name</label>
                            <input
                                value={newAssetInfo.name}
                                onChange={e => setNewAssetInfo(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-banana-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Type</label>
                            <select
                                value={newAssetInfo.type}
                                onChange={e => setNewAssetInfo(prev => ({ ...prev, type: e.target.value as any }))}
                                className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-banana-500 outline-none"
                            >
                                <option value="character">Character</option>
                                <option value="location">Location</option>
                                <option value="item">Item</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Description</label>
                            <textarea
                                value={newAssetInfo.description}
                                onChange={e => setNewAssetInfo(prev => ({ ...prev, description: e.target.value }))}
                                className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-banana-500 outline-none h-24 resize-none"
                                placeholder="Describe this asset for the AI..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setPendingUploads([])}
                            className="px-4 py-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                        >
                            Cancel All
                        </button>
                        <button
                            onClick={handleConfirmCurrentUpload}
                            className="px-4 py-2 bg-indigo-600 dark:bg-banana-500 text-white dark:text-black font-bold rounded hover:bg-indigo-700 dark:hover:bg-banana-400 transition-colors"
                        >
                            {currentUploadIdx === pendingUploads.length - 1 ? 'Finish & Add' : 'Next Asset'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Select Reference Asset</h3>
                    <div className="flex items-center gap-2">
                        {allowMultiple && multiSelection.size > 0 && (
                            <button
                                onClick={handleConfirmSelection}
                                className="bg-indigo-600 dark:bg-banana-500 text-white dark:text-black text-xs font-bold px-3 py-1.5 rounded hover:bg-indigo-700 dark:hover:bg-banana-400 transition-colors"
                            >
                                Confirm ({multiSelection.size})
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                {sceneImages.length > 0 && (
                    <div className="flex border-b border-gray-200 dark:border-white/10">
                        <button
                            onClick={() => setActiveTab('assets')}
                            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'assets'
                                ? 'bg-gray-50 dark:bg-white/5 text-indigo-600 dark:text-banana-500 border-b-2 border-indigo-600 dark:border-banana-500'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                                }`}
                        >
                            Assets Library
                        </button>
                        <button
                            onClick={() => setActiveTab('scenes')}
                            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'scenes'
                                ? 'bg-gray-50 dark:bg-white/5 text-indigo-600 dark:text-banana-500 border-b-2 border-indigo-600 dark:border-banana-500'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                                }`}
                        >
                            Storyboards ({sceneImages.length})
                        </button>
                    </div>
                )}

                <div className="p-4 border-b border-gray-200 dark:border-white/10 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search assets..."
                            className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-banana-500 focus:outline-none transition-colors"
                            autoFocus
                        />
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUpload}
                        className="hidden"
                        accept="image/*"
                        multiple={allowMultiple}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-lg flex items-center gap-2 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                        <Upload className="w-4 h-4" />
                        Upload
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredAssets.map(asset => {
                        const isDisabled = selectedIds.includes(asset.id);
                        const isSelected = multiSelection.has(asset.id);

                        return (
                            <button
                                key={asset.id}
                                onClick={() => {
                                    if (allowMultiple) {
                                        toggleSelection(asset.id);
                                    } else {
                                        onSelect(asset.id, asset);
                                    }
                                }}
                                disabled={isDisabled}
                                className={`group relative aspect-square rounded-lg overflow-hidden border transition-all text-left ${isDisabled
                                    ? 'border-gray-200 dark:border-white/10 opacity-30 cursor-not-allowed'
                                    : isSelected
                                        ? 'border-indigo-500 dark:border-banana-500 ring-1 ring-indigo-500 dark:ring-banana-500'
                                        : 'border-gray-200 dark:border-white/5 hover:border-indigo-500/50 dark:hover:border-banana-500/50 hover:scale-[1.02]'
                                    }`}
                            >
                                {asset.refImageUrl || asset.refImageAssetId ? (
                                    <LazyMedia
                                        assetId={asset.refImageAssetId}
                                        fallbackUrl={asset.refImageUrl}
                                        type="image"
                                        alt={asset.name}
                                        className="w-full h-full"
                                        imgClassName="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 text-xs">
                                        No Image
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 flex flex-col justify-end">
                                    <div className="text-xs font-bold text-white truncate">{asset.name}</div>
                                    <div className="text-[10px] text-gray-400 capitalize">{asset.type}</div>
                                </div>
                                {(isDisabled || isSelected) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50">
                                        {isDisabled ? (
                                            <span className="text-gray-600 dark:text-gray-400 font-bold text-xs bg-white/90 dark:bg-black/80 px-2 py-1 rounded">Added</span>
                                        ) : (
                                            <span className="text-indigo-600 dark:text-banana-500 font-bold text-xs bg-white/90 dark:bg-black/80 px-2 py-1 rounded">Selected</span>
                                        )}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    {filteredAssets.length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500 text-xs">
                            No assets found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
