import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Aperture, Settings, Sparkles, Loader2 } from 'lucide-react';
import MentionTextarea, { SceneImageCandidate } from '@/ui/components/MentionTextarea';
import { ImageGenStatus, Asset } from '@/shared/types';

interface ImagePromptNodeProps {
    id: string;
    data: {
        np_prompt: string;
        imageModel: string;
        imageSize: string;
        imageQuality: string;
        camera: string;
        lens: string;
        focal_length: string;
        aperture: string;
        onUpdate: (field: string, value: any) => void;
        onGenerate: () => void;
        onApply?: () => void;
        genStatus: ImageGenStatus;
        onBlur?: () => void;
        assets: Asset[];
        sceneImages: SceneImageCandidate[];
        connectedImages?: Array<{ nodeId: string; url: string; assetId?: string; name: string }>;
        onDisconnectImage?: (sourceNodeId: string) => void;
        isMainGenerating?: boolean;
        isSelfGenerating?: boolean;
    };
}

const CAMERAS = ['None', 'Arri Alexa Mini LF', 'Red V-Raptor', 'Sony Venice 2', 'Panavision DXL2', 'BMD Ursa Mini Pro', 'Canon C500 Mk II'];
const LENSES = ['None', 'Arri Signature Prime', 'Zeiss Supreme Prime', 'Cooke SF 1.8x', 'Panavision Primo', 'Leica Summilux-C', 'Angenieux Optimo'];
const FOCAL_LENGTHS = ['None', '18', '24', '35', '50', '75', '85', '100', '125', '135', '150'];
const APERTURES = ['None', 'f/1.2', 'f/1.4', 'f/1.8', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0', 'f/11', 'f/16'];

const CameraDropdown: React.FC<{
    label: string;
    value: string;
    presets: string[];
    onChange: (val: string) => void;
}> = ({ label, value, presets, onChange }) => {
    const isNone = !value || value === 'None' || value === '';
    const isPreset = presets.includes(value) || isNone;
    const selectValue = isNone ? 'None' : (isPreset ? value : 'Custom');
    const [customVal, setCustomVal] = React.useState(isPreset ? '' : value);

    React.useEffect(() => {
        if (!isPreset) {
            setCustomVal(value);
        }
    }, [value, isPreset]);

    return (
        <div className="flex flex-col gap-1 w-[48%] min-w-[100px]">
            <span className="text-[10px] text-gray-400 font-bold tracking-wide">{label}</span>
            <select
                value={selectValue}
                onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'Custom') {
                        onChange(customVal || '');
                    } else {
                        onChange(val === 'None' ? '' : val);
                    }
                }}
                className="w-full text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-cyan-500 cursor-pointer"
            >
                {presets.map((p) => (
                    <option key={p} value={p}>{p === 'None' ? '—' : p}</option>
                ))}
                <option value="Custom">自定义...</option>
            </select>
            {selectValue === 'Custom' && (
                <input
                    type="text"
                    value={customVal}
                    placeholder="自定义参数..."
                    onChange={(e) => {
                        const val = e.target.value;
                        setCustomVal(val);
                        onChange(val);
                    }}
                    className="w-full text-xs bg-slate-950 border border-cyan-500/30 rounded-lg px-2.5 py-1 text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600 mt-1"
                />
            )}
        </div>
    );
};

export const ImagePromptNode: React.FC<ImagePromptNodeProps> = ({ id, data }) => {
    const {
        np_prompt,
        imageModel,
        imageSize,
        imageQuality,
        camera,
        lens,
        focal_length,
        aperture,
        onUpdate,
        onGenerate,
        onApply,
        genStatus,
        onBlur,
        assets,
        sceneImages,
        connectedImages,
        onDisconnectImage,
        isMainGenerating,
        isSelfGenerating
    } = data;

    const isGenerating = genStatus === ImageGenStatus.GENERATING;

    return (
        <div className="relative flex flex-col gap-3.5 p-4 rounded-2xl border border-cyan-500/30 bg-[#0e0e11]/90 shadow-2xl shadow-cyan-500/5 w-[300px]">
            {/* Target handle: assets flow in */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="w-2.5 h-2.5 bg-cyan-500 border-2 border-slate-900 rounded-full !left-[-5px]"
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <Aperture className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span className="text-xs font-bold text-gray-100 tracking-wider">Image 生成配置</span>
                </div>
                <Settings className="w-3.5 h-3.5 text-gray-500" />
            </div>

            {/* Dropdowns Group (model, Size, Quality) */}
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 col-span-2">
                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">生图模型</span>
                    <select
                        value={imageModel || 'gpt-image-2'}
                        onChange={(e) => {
                            const newModel = e.target.value;
                            onUpdate('imageModel', newModel);
                            if (newModel === 'nano-banana-pro') {
                                onUpdate('imageQuality', '2K');
                            } else if (newModel === 'polo') {
                                onUpdate('imageSize', '');
                                onUpdate('imageQuality', '');
                            } else {
                                onUpdate('imageQuality', 'auto');
                            }
                        }}
                        className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-200 outline-none focus:border-cyan-500 cursor-pointer w-full"
                    >
                        <option value="gpt-image-2">gpt-image-2</option>
                        <option value="nano-banana-pro">nano-banana-pro</option>
                        <option value="gpt-image-2-official">gpt-image-2 (官方版)</option>
                    </select>
                </div>

                {imageModel !== 'polo' && (
                    <>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-400 font-bold tracking-wide">尺寸比例</span>
                            <select
                                value={imageSize || '16:9'}
                                onChange={(e) => onUpdate('imageSize', e.target.value)}
                                className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 outline-none focus:border-cyan-500 cursor-pointer"
                            >
                                <option value="16:9">16:9</option>
                                <option value="9:16">9:16</option>
                                <option value="1:1">1:1</option>
                                <option value="3:2">3:2</option>
                                <option value="2:3">2:3</option>
                                <option value="4:5">4:5</option>
                                <option value="5:4">5:4</option>
                                <option value="3:4">3:4</option>
                                <option value="4:3">4:3</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            {imageModel === 'nano-banana-pro' ? (
                                <>
                                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">图像分辨率</span>
                                    <select
                                        value={imageQuality || '2K'}
                                        onChange={(e) => onUpdate('imageQuality', e.target.value)}
                                        className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 outline-none focus:border-cyan-500 cursor-pointer"
                                    >
                                        <option value="1K">1K</option>
                                        <option value="2K">2K</option>
                                        <option value="4K" disabled>4K (暂不可用)</option>
                                    </select>
                                </>
                            ) : (
                                <>
                                    <span className="text-[10px] text-gray-400 font-bold tracking-wide">生成质量</span>
                                    <select
                                        value={imageQuality || 'auto'}
                                        onChange={(e) => onUpdate('imageQuality', e.target.value)}
                                        className="text-xs bg-[#16161a] border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 outline-none focus:border-cyan-500 cursor-pointer"
                                    >
                                        <option value="auto">auto</option>
                                        <option value="low">low</option>
                                        <option value="medium">medium</option>
                                        <option value="high">high</option>
                                    </select>
                                </>
                            )}
                        </div>
                    </>
                )}
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
                                <div className="absolute top-0 left-0 bg-cyan-500 text-black text-[9px] font-bold px-1 rounded-br-md">
                                    {idx + 1}
                                </div>
                                
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

            {/* Camera parameter presets group */}
            <div className="border-t border-white/5 pt-3">
                <span className="text-[11px] font-bold text-cyan-400/80 tracking-wider block mb-2">相机与镜头参数</span>
                <div className="flex flex-wrap gap-x-2 gap-y-3 justify-between">
                    <CameraDropdown label="相机机型" value={camera || ''} presets={CAMERAS} onChange={(val) => onUpdate('camera', val)} />
                    <CameraDropdown label="镜头型号" value={lens || ''} presets={LENSES} onChange={(val) => onUpdate('lens', val)} />
                    <CameraDropdown label="焦距 (mm)" value={focal_length || ''} presets={FOCAL_LENGTHS} onChange={(val) => onUpdate('focal_length', val)} />
                    <CameraDropdown label="光圈大小" value={aperture || ''} presets={APERTURES} onChange={(val) => onUpdate('aperture', val)} />
                </div>
            </div>

            {/* Prompt text area — wrapped to prevent React Flow from intercepting keyboard events */}
            <div className="flex flex-col gap-1 border-t border-white/5 pt-3">
                <span className="text-[10px] text-gray-400 font-bold tracking-wide">Image 提示词</span>
                <div className="nowheel nopan nodrag" onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <MentionTextarea
                        value={np_prompt || ''}
                        onChange={(val) => onUpdate('np_prompt', val)}
                        onBlur={onBlur}
                        assets={assets || []}
                        sceneImages={sceneImages || []}
                        referencedAssetIds={[]}
                        onMention={() => { }}
                        onUnmention={() => { }}
                        mode="image"
                        placeholder="输入画面描述词，输入 @ 触发提示..."
                        className="flex-1 w-full p-2 bg-[#16161a] border border-white/10 rounded-xl text-xs outline-none focus:border-cyan-500 min-h-[70px] max-h-[120px]"
                    />
                </div>
            </div>

            {/* Generate Trigger Button */}
            <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:bg-gray-800 disabled:text-gray-500 shadow-md shadow-cyan-400/10 hover:shadow-cyan-400/25 active:scale-[0.98] transition-all mt-1"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>渲染图片中...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>生成分镜图</span>
                    </>
                )}
            </button>

            {id !== 'image-prompt' && onApply && (
                <button
                    onClick={onApply}
                    disabled={isMainGenerating || isSelfGenerating || isGenerating}
                    className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all mt-1 border
                        ${(isMainGenerating || isSelfGenerating || isGenerating)
                            ? 'bg-gray-800/50 border-white/5 text-gray-500 cursor-not-allowed opacity-50'
                            : 'text-gray-200 border-cyan-500/30 hover:border-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 active:scale-[0.98]'}`}
                >
                    应用为主版本
                </button>
            )}

            {/* Source handle: outputs the generated scene candidate */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                className="w-2.5 h-2.5 bg-cyan-500 border-2 border-slate-900 rounded-full !right-[-5px]"
            />
        </div>
    );
};
