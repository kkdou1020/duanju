import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { generateSceneImage } from '@/services/ai';
import { loadAssetBase64, getStorageEstimate, cleanUnusedLocalBlobs } from '@/services/storage';
import { translations, Translation } from '@/services/i18n/translations';
import { STATE_KEY } from '@/shared/constants/defaults';
import { useSessionRestore } from '@/features/useSessionRestore';
import { useSceneManager } from '@/features/useSceneManager';
import { useChunkManager } from '@/features/useChunkManager';
import { buildCopiedChunk } from './chunkUtils';
import { deleteAssetGlobal, deleteAssetLocal, pruneAssetsOnChunkDelete } from './assetUtils';

export function useAppState() {
    // ── Core State ──────────────────────────────────
    const [globalAssets, setGlobalAssets] = useState<Asset[]>([]);
    const [chunks, setChunks] = useState<NovelChunk[]>([]);
    const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showGlobalSelector, setShowGlobalSelector] = useState(false);
    const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
    const [analysisProgress, setAnalysisProgress] = useState("");
    const [language, setLanguage] = useState<string>("Chinese");
    const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
        director: { selected: 'None', strength: 5, seed: '5555', options: [] },
        work: { selected: 'None', strength: 5, seed: '5555', options: [] },
        texture: { selected: 'None', strength: 5, seed: '5555', options: [] },
        aspectRatio: '16:9',
        visualTags: '',
        narrationVoice: 'Kore'
    });
    const [filename, setFilename] = useState("");
    const [fullNovelText, setFullNovelText] = useState("");
    
    // Toast State
    const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({ message, type });
        toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
        }, 5000);
    }, []);

    useEffect(() => {
        const handleShowToast = (e: Event) => {
            const customEvent = e as CustomEvent<{ message: string; type?: 'info' | 'success' | 'warning' }>;
            if (customEvent.detail) {
                showToast(customEvent.detail.message, customEvent.detail.type || 'info');
            }
        };
        window.addEventListener('show-toast', handleShowToast);
        return () => {
            window.removeEventListener('show-toast', handleShowToast);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, [showToast]);

    useEffect(() => {
        const handleUpdateGlobalStyle = (e: Event) => {
            const customEvent = e as CustomEvent<Partial<GlobalStyle>>;
            if (customEvent.detail) {
                setGlobalStyle(prev => ({ ...prev, ...customEvent.detail }));
            }
        };
        window.addEventListener('update-global-style', handleUpdateGlobalStyle);
        return () => window.removeEventListener('update-global-style', handleUpdateGlobalStyle);
    }, []);

    // Background Storage auto-GC check
    useEffect(() => {
        const runBackgroundGC = async () => {
            try {
                const estimate = await getStorageEstimate();
                // Trigger auto GC if usage is > 1GB or percentage is > 80%
                const triggerGC = estimate.usage > 1024 * 1024 * 1024 || estimate.percentage > 80;
                if (triggerGC) {
                    const activeIds = new Set<string>();
                    if (Array.isArray(globalAssetsRef.current)) {
                        for (const asset of globalAssetsRef.current) {
                            if (asset.refImageAssetId) activeIds.add(asset.refImageAssetId);
                        }
                    }
                    if (Array.isArray(chunks)) {
                        for (const chunk of chunks) {
                            if (Array.isArray(chunk.assets)) {
                                for (const asset of chunk.assets) {
                                    if (asset.refImageAssetId) activeIds.add(asset.refImageAssetId);
                                }
                            }
                            if (Array.isArray(chunk.scenes)) {
                                for (const scene of chunk.scenes) {
                                    if (scene.imageAssetId) activeIds.add(scene.imageAssetId);
                                    if (scene.videoAssetId) activeIds.add(scene.videoAssetId);
                                    if (scene.startEndVideoAssetId) activeIds.add(scene.startEndVideoAssetId);
                                    if (Array.isArray(scene.prompt_options)) {
                                        for (const opt of scene.prompt_options) {
                                            if (opt.imageAssetId) activeIds.add(opt.imageAssetId);
                                            if (opt.videoAssetId) activeIds.add(opt.videoAssetId);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    const { cleanedCount } = await cleanUnusedLocalBlobs(activeIds);
                    if (cleanedCount > 0) {
                        showToast(
                            language === 'Chinese' 
                                ? `[存储清理] 已自动为您清理了 ${cleanedCount} 个过期的草稿视频/图片缓存。` 
                                : `[Storage] Cleaned ${cleanedCount} unused draft video/image caches.`,
                            'info'
                        );
                    }
                }
            } catch (e) {
                console.warn("Background auto-GC check failed:", e);
            }
        };

        const timer = setTimeout(runBackgroundGC, 5000);
        return () => clearTimeout(timer);
    }, [chunks.length, globalAssets.length]);

    // Theme State
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('theme');
        return (saved as 'light' | 'dark') || 'dark'; // Default to dark for backward compatibility
    });

    const toggleTheme = () => {
        setTheme(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            return next;
        });
    };

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const globalAssetsRef = useRef(globalAssets);
    useEffect(() => { globalAssetsRef.current = globalAssets; }, [globalAssets]);

    // Sync expanded chunk with active chunk
    useEffect(() => {
        if (activeChunkId) setExpandedId(activeChunkId);
    }, [activeChunkId]);

    const t = translations[language] || translations["Chinese"];

    // ── Hooks ────────────────────────────────────────
    useSessionRestore({
        globalAssets, setGlobalAssets, chunks, setChunks,
        globalStyle, setGlobalStyle, language, setLanguage,
        filename, setFilename, fullNovelText, setFullNovelText
    });

    const { flashScene, handleSceneUpdate, handleDuplicateScene } = useSceneManager(chunks, setChunks);

    const {
        updateChunk, handleLoadNovel, handleChunkExtract, handleManualExtractAssets,
        handleChunkScript, handleGenerateBeats, handleGeneratePrompts,
        handleImportChunk, handleAnalyze, extractingChunksRef
    } = useChunkManager({
        chunks, setChunks, globalAssets, setGlobalAssets, globalAssetsRef,
        globalStyle, setGlobalStyle, language, setStatus, setAnalysisProgress,
        filename, setFilename, fullNovelText, setFullNovelText
    });



    // ── Derived State ───────────────────────────────
    const targetChunkId = expandedId || activeChunkId;
    const targetChunk = targetChunkId ? chunks.find(c => c.id === targetChunkId) : null;

    const displayedAssets = useMemo(() => {
        if (!targetChunk) return globalAssets;
        const chunkAssets = targetChunk.assets;
        const chunkAssetIds = new Set(chunkAssets.map(a => a.id));
        const usedAssetIds = new Set<string>();
        targetChunk.scenes.forEach(scene => {
            if (scene.assetIds) scene.assetIds.forEach(id => usedAssetIds.add(id));
            if (scene.videoAssetIds) scene.videoAssetIds.forEach(id => usedAssetIds.add(id));
            if (scene.imageAssetId) usedAssetIds.add(scene.imageAssetId);
            if (scene.videoAssetId) usedAssetIds.add(scene.videoAssetId);
        });
        const borrowedAssets: Asset[] = [];
        usedAssetIds.forEach(id => {
            if (!id || id.startsWith('scene_img_')) return;
            if (!chunkAssetIds.has(id)) {
                const found = globalAssets.find(ga => ga.id === id);
                if (found) borrowedAssets.push(found);
            }
        });
        return [...chunkAssets, ...borrowedAssets];
    }, [targetChunk, globalAssets]);

    // ── Handlers ────────────────────────────────────
    const handleGenerateImageWrapper = async (scene: Scene, chunkAssets?: Asset[], optionId?: string, allScenes?: Scene[], signal?: AbortSignal) => {
        const assetsToUse = chunkAssets || displayedAssets;
        // Resolve blob: URLs to base64 before sending to backend (blob URLs are browser-only)
        const resolvedAssets = await Promise.all(assetsToUse.map(async (a) => {
            if (a.refImageUrl?.startsWith('blob:') && a.refImageAssetId) {
                const base64 = await loadAssetBase64(a.refImageAssetId);
                if (base64) {
                    // Normalize MIME type — blobs from IndexedDB/ZIP may have application/octet-stream
                    const fixed = base64.replace(/^data:[^;]+/, 'data:image/png');
                    return { ...a, refImageUrl: fixed };
                }
                return a;
            }
            return a;
        }));
        const result = await generateSceneImage(scene, globalStyle, resolvedAssets, optionId, allScenes, signal);
        return result.imageUrl || result;
    };

    const handleUpdateAsset = (updatedAsset: Asset) => {
        setGlobalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
        setChunks(prev => prev.map(chunk => {
            const exists = chunk.assets.some(a => a.id === updatedAsset.id);
            if (exists) return { ...chunk, assets: chunk.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a) };
            else if (chunk.id === targetChunkId) return { ...chunk, assets: [...chunk.assets, updatedAsset] };
            return chunk;
        }));
    };

    const handleAddAsset = (newAsset: Asset) => {
        if (targetChunkId) {
            setChunks(prev => prev.map(c => {
                if (c.id !== targetChunkId) return c;
                if (c.assets.some(a => a.id === newAsset.id)) return c;
                return { ...c, assets: [...c.assets, newAsset] };
            }));
            setGlobalAssets(prev => {
                if (prev.some(a => a.id === newAsset.id)) return prev;
                return [...prev, newAsset];
            });
        } else {
            setGlobalAssets(prev => [...prev, newAsset]);
        }
    };

    const handleDeleteAsset = (id: string) => {
        if (targetChunkId) {
            // 局部删除: 仅从当前 chunk 移除
            setChunks(prev => deleteAssetLocal(prev, targetChunkId, id));
        } else {
            // 全局删除: 从 global + 所有 chunk 移除
            const result = deleteAssetGlobal(globalAssets, chunks, id);
            setGlobalAssets(result.globalAssets);
            setChunks(result.chunks);
        }
    };

    const handleDeleteChunk = (chunkId: string) => {
        if (confirm(t.confirmDeleteChunk)) {
            // 先清理孤儿资产(必须在删除 chunk 前执行, 需要读取被删 chunk 的 assets)
            const pruned = pruneAssetsOnChunkDelete(globalAssets, chunks, chunkId);
            if (pruned !== globalAssets) setGlobalAssets(pruned);
            setChunks(prev => prev.filter(c => c.id !== chunkId));
            if (activeChunkId === chunkId) setActiveChunkId(null);
            if (expandedId === chunkId) setExpandedId(null);
        }
    };

    const handleCopyChunk = (chunkId: string) => {
        setChunks(prev => buildCopiedChunk(prev, chunkId));
    };

    return {
        // State
        chunks, globalAssets, globalStyle, setGlobalStyle,
        language, setLanguage, status, analysisProgress,
        expandedId, setExpandedId, activeChunkId, setActiveChunkId,
        showGlobalSelector, setShowGlobalSelector,
        filename, fullNovelText,
        t, targetChunkId, targetChunk, displayedAssets,


        // Chunk actions
        updateChunk, handleLoadNovel, handleAnalyze,
        handleChunkExtract, handleChunkScript, handleGenerateBeats, handleGeneratePrompts, handleImportChunk,
        handleManualExtractAssets, extractingChunksRef,

        // Scene actions
        flashScene, handleSceneUpdate, handleDuplicateScene,

        // Asset actions
        handleGenerateImageWrapper, handleUpdateAsset, handleAddAsset, handleDeleteAsset,

        // Chunk delete & copy
        handleDeleteChunk,
        handleCopyChunk,

        // Theme
        theme, toggleTheme,

        // Toast Notification
        toast, showToast,
    };
}
