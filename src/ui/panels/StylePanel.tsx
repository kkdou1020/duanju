import React, { useState, useRef } from 'react';
import { GlobalStyle, StyleSetting } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Info, RectangleHorizontal, RectangleVertical, Mic, Volume2, Upload, X, Sparkles, Image as ImageIcon, Lock, Unlock } from 'lucide-react';
import { VOICE_OPTIONS, generateSpeech, pcmToWav, analyzeVisualStyleFromImages, extractVisualDna } from '@/services/ai';

interface StylePanelProps {
    styleState: GlobalStyle;
    onStyleChange: (newStyle: GlobalStyle) => void;
    labels: Translation;
    language?: string;
}

const StylePanel: React.FC<StylePanelProps> = ({ styleState, onStyleChange, labels, language = "Chinese" }) => {

    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Image Upload State
    const [uploadImages, setUploadImages] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isLocking, setIsLocking] = useState(false);
    const [draftTags, setDraftTags] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const is1to1 = Boolean(styleState.work?.useOriginalCharacters && (styleState.work?.custom || (styleState.work?.selected !== 'None' ? styleState.work?.selected : '')));

    const handleGenerateDna = async () => {
        if (styleState.visualDnaLocked) return;
        setIsLocking(true);
        try {
            const workName = styleState.work?.custom || (styleState.work?.selected !== 'None' ? styleState.work?.selected : '') || '';

            if (is1to1 && workName) {
                // If 1:1 is checked, bypass LLM and exclusively use the Work Name
                setDraftTags(`[《${workName}》风格], `);
            } else {
                let currentTexture = styleState.texture?.custom || (styleState.texture?.selected !== 'None' ? styleState.texture?.selected : '') || '';

                const res = await extractVisualDna(
                    workName,
                    currentTexture,
                    language || 'Chinese',
                    is1to1,
                    uploadImages.length > 0 ? uploadImages : undefined
                );
                setDraftTags(res.dna || (typeof res === 'string' ? res : ''));
            }
        } catch (e) {
            console.error("Locking DNA failed", e);
            alert("提取失败 / Extraction failed");
        } finally {
            setIsLocking(false);
        }
    };

    const confirmLock = () => {
        if (!draftTags) return;
        onStyleChange({
            ...styleState,
            visualTags: draftTags,
            visualDnaLocked: true
        });
        setDraftTags(null);
    };

    const cancelDraft = () => {
        setDraftTags(null);
    };

    const handleUnlockStyle = () => {
        if (window.confirm(language === "Chinese" ? "解锁将允许您修改全局风格，但也可能导致后续分镜与之前画风不一致。是否继续？" : "Unlocking allows changing global style, but may cause inconsistencies with already generated assets. Continue?")) {
            onStyleChange({
                ...styleState,
                visualTags: '',
                visualDnaLocked: false
            });
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const remainingSlots = 10 - uploadImages.length;
        if (remainingSlots <= 0) return;

        const filesToProcess = Array.from(files).slice(0, remainingSlots);

        filesToProcess.forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setUploadImages(prev => [...prev, reader.result as string]);
                }
            };
            reader.readAsDataURL(file);
        });

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeImage = (index: number) => {
        setUploadImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleAnalyzeImages = async () => {
        if (uploadImages.length === 0 || is1to1) return;
        setIsAnalyzing(true);
        try {
            const dna = await analyzeVisualStyleFromImages(uploadImages, language);
            if (dna) {
                onStyleChange({
                    ...styleState,
                    visualTags: dna, // Update Visual DNA
                    texture: {
                        ...styleState.texture,
                        custom: dna // Also put it in custom texture field for visibility
                    }
                });
            }
        } catch (e) {
            console.error("Analysis failed", e);
        } finally {
            setIsAnalyzing(false);
        }
    };



    const updateSetting = (type: 'director' | 'work' | 'texture', field: keyof StyleSetting, value: any) => {
        const updated: GlobalStyle = {
            ...styleState,
            [type]: {
                ...styleState[type],
                [field]: value
            }
        };
        // 当修改参考作品或画面质感时，清除缓存的 Visual DNA，强制下次重新生成
        if (type === 'work' || type === 'texture') {
            updated.visualTags = '';
            updated.visualDnaLocked = false;
        }
        onStyleChange(updated);
    };

    const handleVoicePreview = async () => {
        const voiceId = styleState.narrationVoice || "Kore";
        setPreviewingVoice(voiceId);
        try {
            // Short phrase for preview
            const text = language === "Chinese"
                ? "这是一个声音测试，用于旁白配音预览。"
                : "This is a voice test for narration preview.";

            const base64 = await generateSpeech(text, voiceId);

            const binaryString = atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
            const url = URL.createObjectURL(wavBlob);

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
            }
        } catch (e) {
            console.error("Voice preview failed", e);
        } finally {
            setPreviewingVoice(null);
        }
    };

    const renderSection = (
        type: 'director' | 'work' | 'texture',
        title: string,
        hint: string,
        current: StyleSetting,
        placeholder: string
    ) => {
        return (
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all">
                <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-indigo-600 dark:text-banana-400 text-sm">{title}</h3>
                    <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 dark:bg-black/90 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-lg">
                            {hint}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {/* Custom Input */}
                    <input
                        type="text"
                        placeholder={type === 'texture' && is1to1 ? (language === 'Chinese' ? '1:1还原模式下无法叠加画面质感' : 'Texture input disabled in 1:1 Restore mode') : placeholder}
                        value={current.custom || ''}
                        onChange={(e) => updateSetting(type, 'custom', e.target.value)}
                        className="w-full bg-white dark:bg-black/40 text-sm text-indigo-900 dark:text-banana-100 placeholder-gray-400 dark:placeholder-gray-600 p-2 rounded border border-gray-300 dark:border-white/10 focus:border-indigo-500/50 dark:focus:border-banana-500/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={styleState.visualDnaLocked || (type === 'texture' && is1to1)}
                    />

                    {/* Dropdown Selector */}
                    <select
                        value={current.selected}
                        onChange={(e) => updateSetting(type, 'selected', e.target.value)}
                        className="w-full bg-white dark:bg-black/30 text-sm text-gray-700 dark:text-gray-400 p-2 rounded border border-gray-300 dark:border-white/10 focus:border-indigo-500/50 dark:focus:border-banana-500/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!!current.custom || styleState.visualDnaLocked || (type === 'texture' && is1to1)}
                    >
                        <option value="None">{labels.none}</option>
                        {current.options.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-gray-500 uppercase">{labels.strength}</span>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={current.strength}
                            onChange={(e) => updateSetting(type, 'strength', parseInt(e.target.value))}
                            className="flex-1 accent-indigo-600 dark:accent-banana-500 h-1 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={styleState.visualDnaLocked}
                        />
                        <span className="text-xs font-mono w-4 text-right">{current.strength}</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-800 border-x border-b border-gray-200 dark:border-white/10 rounded-b-xl overflow-hidden shadow-sm dark:shadow-xl p-4 space-y-4 overflow-y-auto">
            {/* Locked Status Banner */}
            {styleState.visualDnaLocked && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex flex-col gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                    <div className="flex items-start gap-2">
                        <Lock className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs text-yellow-200 font-medium leading-relaxed">
                                {language === 'Chinese' ? '全局视觉风格已锁定。为保证全片画风一致，当前设置已不可更改。' : 'Global visual style is locked to ensure consistency.'}
                            </p>
                            <button onClick={handleUnlockStyle} className="mt-2 text-[10px] flex items-center justify-center gap-1 text-yellow-500/50 hover:text-yellow-500 transition-colors underline">
                                <Unlock className="w-3 h-3" />
                                {language === 'Chinese' ? '强行解锁（不推荐）' : 'Force Unlock (Not Recommended)'}
                            </button>
                        </div>
                    </div>
                    {styleState.visualTags && (
                        <div className="mt-1 pt-2 border-t border-yellow-500/20">
                            <span className="text-[10px] text-yellow-500/70 block mb-1">
                                {language === 'Chinese' ? '当前固化的视觉基因 (DNA):' : 'Locked Visual DNA:'}
                            </span>
                            <div className="bg-black/60 rounded p-2 text-xs font-mono text-yellow-100/90 break-all border border-yellow-500/20 shadow-inner">
                                {styleState.visualTags}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Aspect Ratio Selector */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all">
                <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-bold text-indigo-600 dark:text-banana-400 text-sm">{labels.aspectRatio}</h3>
                    <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 dark:bg-black/90 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-lg">
                            {labels.arHint}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onStyleChange({ ...styleState, aspectRatio: '16:9' })}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded border ${styleState.aspectRatio === '16:9' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black border-indigo-600 dark:border-banana-500' : 'bg-white dark:bg-black/20 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30'}`}
                    >
                        <RectangleHorizontal className="w-5 h-5" />
                        <span className="text-xs font-bold">16:9</span>
                    </button>
                    <button
                        onClick={() => onStyleChange({ ...styleState, aspectRatio: '9:16' })}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded border ${styleState.aspectRatio === '9:16' ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black border-indigo-600 dark:border-banana-500' : 'bg-white dark:bg-black/20 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30'}`}
                    >
                        <RectangleVertical className="w-5 h-5" />
                        <span className="text-xs font-bold">9:16</span>
                    </button>
                </div>
            </div>

            {/* Voice Selector */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-indigo-600 dark:text-banana-400 text-sm">{labels.voiceStyle}</h3>
                        <div className="group relative">
                            <Info className="w-3 h-3 text-gray-500 cursor-help" />
                            <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 dark:bg-black/90 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-lg">
                                {labels.voiceHint}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <select
                        value={styleState.narrationVoice}
                        onChange={(e) => onStyleChange({ ...styleState, narrationVoice: e.target.value })}
                        className="flex-1 bg-white dark:bg-black/30 text-sm text-gray-700 dark:text-gray-400 p-2 rounded border border-gray-300 dark:border-white/10 focus:border-indigo-500/50 dark:focus:border-banana-500/50 outline-none"
                    >
                        {VOICE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleVoicePreview}
                        disabled={!!previewingVoice}
                        className="p-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 rounded text-gray-600 dark:text-gray-300"
                        title={labels.previewVoice}
                    >
                        {previewingVoice ? <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                </div>
                <audio ref={audioRef} className="hidden" />
            </div>

            {renderSection('director', labels.directorStyle, labels.directorHint, styleState.director, labels.customPlaceholder)}

            {/* Unified Visual DNA Block */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all shadow-[0_0_15px_rgba(0,0,0,0.01)] dark:shadow-[0_0_15px_rgba(255,255,255,0.01)]">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <h2 className="font-extrabold text-indigo-600 dark:text-banana-400 text-[15px] tracking-wide flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500 dark:text-banana-400" />
                        {language === 'Chinese' ? '视觉基因' : 'Visual DNA'}
                    </h2>
                </div>

                {/* 1. 参考作品 (Reference Work) */}
                <div className="mb-4 pb-4 border-b border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-300">{labels.workStyle}</span>
                        <div className="group relative">
                            <Info className="w-3 h-3 text-gray-600 cursor-help hover:text-gray-400 transition-colors" />
                            <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 dark:bg-black/95 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-xl">
                                {labels.workHint}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        <input
                            type="text"
                            placeholder={labels.customPlaceholder}
                            value={styleState.work.custom || ''}
                            onChange={(e) => updateSetting('work', 'custom', e.target.value)}
                            className="w-full bg-white dark:bg-black/40 text-sm text-indigo-900 dark:text-banana-100 placeholder-gray-400 dark:placeholder-gray-600 p-2 rounded border border-gray-300 dark:border-white/10 focus:border-indigo-500/50 dark:focus:border-banana-500/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={styleState.visualDnaLocked}
                        />
                        <select
                            value={styleState.work.selected}
                            onChange={(e) => updateSetting('work', 'selected', e.target.value)}
                            className="w-full bg-white dark:bg-black/30 text-sm text-gray-700 dark:text-gray-400 p-2 rounded border border-gray-300 dark:border-white/10 focus:border-indigo-500/50 dark:focus:border-banana-500/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled={!!styleState.work.custom || styleState.visualDnaLocked}
                        >
                            <option value="None">{labels.none}</option>
                            {styleState.work.options.map((opt, i) => (
                                <option key={i} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-gray-500 uppercase">{labels.strength}</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={styleState.work.strength}
                                onChange={(e) => updateSetting('work', 'strength', parseInt(e.target.value))}
                                className="flex-1 accent-indigo-600 dark:accent-banana-500 h-1 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={styleState.visualDnaLocked}
                            />
                            <span className="text-xs font-mono w-4 text-right text-gray-400">{styleState.work.strength}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-white/5">
                            <input
                                type="checkbox"
                                id="useOriginalCharacters"
                                checked={styleState.work.useOriginalCharacters || false}
                                onChange={(e) => updateSetting('work', 'useOriginalCharacters', e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-banana-500 focus:ring-indigo-500 dark:focus:ring-banana-500 bg-white dark:bg-gray-800 cursor-pointer accent-indigo-600 dark:accent-banana-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                disabled={styleState.visualDnaLocked}
                            />
                            <label htmlFor="useOriginalCharacters" className="text-xs text-gray-600 dark:text-gray-400 select-none cursor-pointer hover:text-indigo-600 dark:hover:text-banana-400 transition-colors">
                                {language === 'Chinese' ? '影视剧人物/场景/物品1:1还原' : '1:1 Restore Characters/Scenes/Items'}
                            </label>
                            <div className="group relative ml-auto mr-1">
                                <Info className="w-3 h-3 text-gray-600 cursor-help hover:text-gray-400 transition-colors" />
                                <div className="absolute right-0 bottom-full mb-2 w-56 bg-white/95 dark:bg-black/95 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2.5 rounded hidden group-hover:block z-50 pointer-events-none shadow-xl leading-relaxed">
                                    {language === 'Chinese'
                                        ? '若勾选，系统会自动识别并套用原剧的视觉特征公式（例如衣服款式、色带、标志物），直接物理覆盖大模型的自由生成。由于画风会严重冲突，此模式下不再允许混合“画面质感”。'
                                        : 'If checked, system detects characters and injects original film/TV visual DNA directly. Due to high style conflicts, "Texture" blending is physically disabled in this mode.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. 画面质感 (Texture) - Image Upload Only */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-300">{labels.textureStyle}</span>
                        <div className="group relative">
                            <Info className="w-3 h-3 text-gray-600 cursor-help hover:text-gray-400 transition-colors" />
                            <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 dark:bg-black/95 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-xl">
                                {language === 'Chinese' ? '上传参考图以让模型直接提取质感DNA（1:1还原模式下将被禁用，防止风格污染）' : 'Upload reference images for texture extraction (disabled in 1:1 restore mode to prevent contamination).'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2 mt-2">
                        <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            Style Ref ({uploadImages.length}/10)
                        </span>
                    </div>

                    <div className={`grid grid-cols-5 gap-2 transition-opacity ${is1to1 ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        {uploadImages.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded overflow-hidden group border border-gray-300 dark:border-white/10">
                                <img src={img} alt="ref" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-bl"
                                    disabled={styleState.visualDnaLocked}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {uploadImages.length < 10 && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={is1to1 || styleState.visualDnaLocked}
                                className="aspect-square rounded border border-dashed border-gray-300 dark:border-white/20 flex items-center justify-center hover:border-indigo-500/50 dark:hover:border-banana-500/50 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title={is1to1 ? (language === 'Chinese' ? '1:1还原模式下禁传质感图' : 'Disabled in 1:1 Restore') : (language === 'Chinese' ? '上传参考图' : 'Upload Reference Image')}
                            >
                                <Upload className="w-4 h-4 text-gray-500" />
                            </button>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        disabled={is1to1 || styleState.visualDnaLocked}
                    />
                </div>

                {/* Draft DNA Review Block */}
                {draftTags !== null && !styleState.visualDnaLocked && (
                    <div className="bg-indigo-500/10 dark:bg-banana-500/10 border border-indigo-500/30 dark:border-banana-500/30 rounded-lg p-3 flex flex-col gap-2 shadow-[0_0_15px_rgba(99,102,241,0.05)] dark:shadow-[0_0_15px_rgba(234,179,8,0.05)] mt-4">
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500 dark:text-banana-400 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs text-indigo-700 dark:text-banana-200 font-medium">
                                    {language === 'Chinese' ? '视觉基因 (DNA) 已生成，请确认：' : 'Visual DNA generated. Confirm:'}
                                </p>
                            </div>
                        </div>
                        <textarea
                            value={draftTags}
                            onChange={(e) => setDraftTags(e.target.value)}
                            className="w-full h-24 bg-white dark:bg-black/60 text-sm text-indigo-900 dark:text-banana-100 placeholder-gray-400 dark:placeholder-gray-600 p-2 rounded border border-indigo-500/30 dark:border-banana-500/30 focus:border-indigo-500 dark:focus:border-banana-500 outline-none resize-none"
                        />
                        <div className="flex gap-2 mt-1">
                            <button
                                onClick={confirmLock}
                                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 dark:bg-banana-500 dark:hover:bg-banana-400 text-white dark:text-black text-xs font-bold rounded flex justify-center items-center gap-1 transition-colors"
                            >
                                <Lock className="w-3 h-3" />
                                {language === 'Chinese' ? '确认并锁定' : 'Confirm & Lock'}
                            </button>
                            <button
                                onClick={cancelDraft}
                                className="flex-1 py-1.5 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 text-xs rounded hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                {language === 'Chinese' ? '重新提取/取消' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Local Lock / Generate Button */}
                {!styleState.visualDnaLocked && draftTags === null && (
                    <button
                        onClick={handleGenerateDna}
                        disabled={isLocking}
                        className="w-full py-2 px-4 border border-indigo-500/30 dark:border-banana-500/30 bg-indigo-50 dark:bg-banana-500/10 hover:bg-indigo-100 dark:hover:bg-banana-500/20 text-indigo-600 dark:text-banana-400 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 mt-4 shadow-sm"
                    >
                        {isLocking ? (
                            <div className="w-3.5 h-3.5 border border-gray-300 dark:border-black/30 border-t-indigo-600 dark:border-t-banana-400 rounded-full animate-spin" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {language === 'Chinese' ? '提取视觉基因 (DNA)' : 'Extract Visual DNA'}
                    </button>
                )}
            </div>

        </div>
    );
};

export default StylePanel;
