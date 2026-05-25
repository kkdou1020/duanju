import React, { useState, useEffect } from 'react';
import { Asset, GlobalStyle, NovelChunk, Scene } from '@/shared/types';
import { saveState, loadState, loadAssetUrl } from '@/services/storage';
import { STATE_KEY, DEFAULT_STYLES } from '@/shared/constants/defaults';

interface SessionState {
    globalAssets: Asset[];
    setGlobalAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
    chunks: NovelChunk[];
    setChunks: React.Dispatch<React.SetStateAction<NovelChunk[]>>;
    globalStyle: GlobalStyle;
    setGlobalStyle: React.Dispatch<React.SetStateAction<GlobalStyle>>;
    language: string;
    setLanguage: React.Dispatch<React.SetStateAction<string>>;
    filename: string;
    setFilename: React.Dispatch<React.SetStateAction<string>>;
    fullNovelText: string;
    setFullNovelText: React.Dispatch<React.SetStateAction<string>>;
}

/** Re-resolve a blob: URL from IndexedDB, or keep non-blob URLs as-is */
export async function resolveUrl(url?: string, assetId?: string): Promise<string | undefined> {
    // Non-blob URLs (data:, http:) are valid across sessions
    if (url && !url.startsWith('blob:')) return url;
    // Re-resolve from IndexedDB if we have an asset ID
    if (assetId) {
        const freshUrl = await loadAssetUrl(assetId);
        if (freshUrl) return freshUrl;
    }
    return undefined;
}

/** Re-resolve all blob URLs in an asset */
export async function hydrateAsset(asset: Asset): Promise<Asset> {
    const refImageUrl = await resolveUrl(asset.refImageUrl, asset.refImageAssetId);
    if (refImageUrl === asset.refImageUrl) return asset;
    return { ...asset, refImageUrl };
}

/** Re-resolve all blob URLs in a scene */
export async function hydrateScene(scene: Scene): Promise<Scene> {
    const [imageUrl, videoUrl, startEndVideoUrl, narrationAudioUrl] = await Promise.all([
        resolveUrl(scene.imageUrl, scene.imageAssetId),
        resolveUrl(scene.videoUrl, scene.videoAssetId),
        resolveUrl(scene.startEndVideoUrl, scene.startEndVideoAssetId),
        resolveUrl(scene.narrationAudioUrl, undefined), // no separate assetId for audio
    ]);

    let prompt_options = scene.prompt_options;
    if (prompt_options && prompt_options.length > 0) {
        prompt_options = await Promise.all(
            prompt_options.map(async (opt) => {
                const [optImg, optVid] = await Promise.all([
                    resolveUrl(opt.imageUrl, opt.imageAssetId),
                    resolveUrl(opt.videoUrl, opt.videoAssetId),
                ]);
                return { ...opt, imageUrl: optImg, videoUrl: optVid };
            })
        );
    }

    return { 
        ...scene, 
        imageUrl, 
        videoUrl, 
        startEndVideoUrl, 
        narrationAudioUrl,
        prompt_options
    };
}

export function useSessionRestore(state: SessionState) {
    const [isRestored, setIsRestored] = useState(false);
    const { globalAssets, setGlobalAssets, chunks, setChunks, globalStyle, setGlobalStyle, language, setLanguage, filename, setFilename, fullNovelText, setFullNovelText } = state;

    // Restore State
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const savedState = await loadState(STATE_KEY);
                if (savedState) {
                    if (savedState.globalAssets) {
                        const hydrated = await Promise.all(
                            savedState.globalAssets.map((a: Asset) => hydrateAsset(a))
                        );
                        setGlobalAssets(hydrated);
                    }
                    if (savedState.chunks) {
                        const hydratedChunks = await Promise.all(
                            savedState.chunks.map(async (chunk: NovelChunk) => ({
                                ...chunk,
                                assets: await Promise.all(
                                    chunk.assets.map((a: Asset) => hydrateAsset(a))
                                ),
                                scenes: await Promise.all(
                                    chunk.scenes.map((s: Scene) => hydrateScene(s))
                                ),
                            }))
                        );
                        setChunks(hydratedChunks);
                    }
                    if (savedState.globalStyle) setGlobalStyle(savedState.globalStyle);
                    if (savedState.language) setLanguage(savedState.language);
                    if (savedState.filename) setFilename(savedState.filename);
                    if (savedState.fullNovelText) setFullNovelText(savedState.fullNovelText);
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            } finally {
                setIsRestored(true);
            }
        };
        restoreSession();
    }, []);

    // Save State (debounced)
    useEffect(() => {
        if (!isRestored) return;
        const timeoutId = setTimeout(() => {
            saveState(STATE_KEY, { globalAssets, chunks, globalStyle, language, filename, fullNovelText })
                .catch(e => console.error("Failed to save state", e));
        }, 200);
        return () => clearTimeout(timeoutId);
    }, [globalAssets, chunks, globalStyle, language, filename, fullNovelText, isRestored]);

    // Sync language -> default style options
    useEffect(() => {
        const defaults = DEFAULT_STYLES[language] || DEFAULT_STYLES["English"];
        setGlobalStyle(prev => ({
            ...prev,
            director: { ...prev.director, options: defaults.directors },
            work: { ...prev.work, options: defaults.works },
            texture: { ...prev.texture, options: defaults.textures }
        }));
    }, [language]);

    return { isRestored };
}


