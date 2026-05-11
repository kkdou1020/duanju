import React, { useRef } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { extractAssets, extractVisualDna, analyzeNarrative, generateEpisodeScenes, generateBeatSheet, generatePromptsFromBeatsStream, buildAssetPrompts } from '@/services/ai';
import { loadAssetUrl, saveAsset } from '@/services/storage';
import { mergeAssetsIntoGlobal, pruneOrphanedGlobalAssets } from '@/app/assetUtils';
import { parseImportData } from '@/app/chunkUtils';
import JSZip from 'jszip';

interface ChunkManagerDeps {
    chunks: NovelChunk[];
    setChunks: React.Dispatch<React.SetStateAction<NovelChunk[]>>;
    globalAssets: Asset[];
    setGlobalAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
    globalAssetsRef: React.MutableRefObject<Asset[]>;
    globalStyle: GlobalStyle;
    setGlobalStyle: React.Dispatch<React.SetStateAction<GlobalStyle>>;
    language: string;
    setStatus: React.Dispatch<React.SetStateAction<AnalysisStatus>>;
    setAnalysisProgress: React.Dispatch<React.SetStateAction<string>>;
    filename: string;
    setFilename: React.Dispatch<React.SetStateAction<string>>;
    fullNovelText: string;
    setFullNovelText: React.Dispatch<React.SetStateAction<string>>;
}

export function useChunkManager(deps: ChunkManagerDeps) {
    const {
        chunks, setChunks, globalAssets, setGlobalAssets, globalAssetsRef,
        globalStyle, setGlobalStyle, language, setStatus, setAnalysisProgress,
        filename, setFilename, fullNovelText, setFullNovelText
    } = deps;

    const scriptingChunksRef = useRef<Set<string>>(new Set());
    const extractingChunksRef = useRef<Set<string>>(new Set());
    const isAnalyzingRef = useRef(false);

    const updateChunk = (id: string, updates: Partial<NovelChunk> | ((c: NovelChunk) => Partial<NovelChunk>)) => {
        setChunks(prev => prev.map(c => {
            if (c.id !== id) return c;
            const changes = typeof updates === 'function' ? updates(c) : updates;
            return { ...c, ...changes };
        }));
    };

    const fallbackChunking = (text: string) => {
        const newChunks: NovelChunk[] = [{
            id: `chunk_${Date.now()}_full`,
            index: 0,
            title: "Full Text (Fallback)",
            text,
            status: 'idle',
            assets: [],
            scenes: []
        }];
        setChunks(newChunks);
    };

    const handleLoadNovel = (text: string, fname: string, episodeCount?: number) => {
        if (!text) {
            setChunks([]);
            setFilename("");
            setFullNovelText("");
            return;
        }
        setFilename(fname);
        setFullNovelText(text);
    };

    const handleChunkExtract = async (chunk: NovelChunk) => {
        if (extractingChunksRef.current.has(chunk.id)) {
            console.warn(`Extraction for chunk ${chunk.id} already in progress.`);
            return;
        }
        extractingChunksRef.current.add(chunk.id);

        try {
            const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
            const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
            const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;
            const skipDna = !!textureStyle;

            const result = await extractAssets(chunk.text, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters, skipDna);

            if (result.visualDna && !globalStyle.visualDnaLocked && !globalStyle.visualTags) {
                setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
            }

            // Pre-generate prompts for extracted assets
            let enrichedExtracted = result.assets;
            try {
                const promptResult = await buildAssetPrompts(result.assets, globalStyle);
                enrichedExtracted = promptResult.assets;
            } catch (e) { console.warn('Pre-gen prompts failed:', e); }

            // Merge into global (update fields, preserve existing refImageUrl)
            const currentAssets = globalAssetsRef.current;
            const previousIds = chunk.assets.map(a => a.id);
            const newAssetIds = enrichedExtracted.map(a => a.id);
            const { merged, hasChanges } = mergeAssetsIntoGlobal(currentAssets, enrichedExtracted);
            // Conditionally prune orphaned assets from global
            const pruned = pruneOrphanedGlobalAssets(merged, previousIds, newAssetIds, chunks, chunk.id);
            if (hasChanges || pruned !== merged) setGlobalAssets(pruned);

            const chunkAssets = enrichedExtracted.map(extracted => {
                return pruned.find(ga => ga.id === extracted.id) || extracted;
            });

            updateChunk(chunk.id, { assets: chunkAssets });
            return chunkAssets;
        } catch (e) {
            console.error("Chunk extraction failed", e);
            throw e;
        } finally {
            extractingChunksRef.current.delete(chunk.id);
        }
    };

    const handleManualExtractAssets = async (text: string) => {
        // Fall back to full novel text or active chunk text when textarea is empty
        let textToUse = text;
        if (!textToUse.trim()) {
            textToUse = fullNovelText || chunks.map(c => c.text).join('\n');
        }
        if (!textToUse.trim()) return;

        setStatus(AnalysisStatus.EXTRACTING);
        try {
            const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
            const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
            const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;

            const result = await extractAssets(textToUse, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters);

            if (result.visualDna && !globalStyle.visualDnaLocked && !globalStyle.visualTags) {
                setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
            }

            // Pre-generate prompts for extracted assets
            let enrichedAssets = result.assets;
            try {
                const promptResult = await buildAssetPrompts(result.assets, globalStyle);
                enrichedAssets = promptResult.assets;
            } catch (e) { console.warn('Pre-gen prompts failed:', e); }

            setGlobalAssets(prev => {
                const newAssets = [...prev];
                enrichedAssets.forEach(extracted => {
                    if (!newAssets.some(ga => ga.id === extracted.id)) {
                        newAssets.push(extracted);
                    }
                });
                return newAssets;
            });

            setStatus(AnalysisStatus.COMPLETED);
        } catch (e) {
            console.error("Manual Extract Error", e);
            setStatus(AnalysisStatus.ERROR);
            setTimeout(() => setStatus(AnalysisStatus.IDLE), 3000);
        }
    };

    const handleChunkScript = async (chunk: NovelChunk) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Script generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (chunk.episodeData) {
                const updatedEpisodeData = { ...chunk.episodeData };
                const scenes = await generateEpisodeScenes(
                    updatedEpisodeData,
                    chunk.batchMeta,
                    language,
                    globalAssets,
                    globalStyle,
                    chunk.text
                );
                return scenes;
            }

            // Fallback: no episodeData — analyze chunk text as a single episode
            const prevIndex = chunk.index - 1;
            let prevContext = "";
            if (prevIndex >= 0) {
                const prevChunk = chunks[prevIndex];
                if (prevChunk.scenes.length > 0) {
                    prevContext = prevChunk.scenes[prevChunk.scenes.length - 1].narration;
                }
            }

            const directorName = globalStyle.director.custom || (globalStyle.director.selected !== 'None' ? globalStyle.director.selected : '') || '';
            const blueprint = await analyzeNarrative(chunk.text, language, prevContext, undefined, undefined, undefined, directorName, globalStyle.director.strength);

            let allScenes: import('@/shared/types').Scene[] = [];
            for (const episode of blueprint.episodes) {
                const scenes = await generateEpisodeScenes(
                    episode, blueprint.batch_meta, language, globalAssets, globalStyle, chunk.text
                );
                allScenes.push(...scenes);
            }
            return allScenes;
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    // --- Step 1: Generate Beat Sheet + Extract Assets → storyboarded ---
    const handleGenerateBeats = async (chunk: NovelChunk) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Beat generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (chunk.episodeData) {
                // Auto-generate Visual DNA (A1) if not already present
                if (!globalStyle.visualTags) {
                    const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
                    const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
                    const dna = await extractVisualDna(workStyle, textureStyle, language);
                    if (dna) {
                        setGlobalStyle(prev => ({ ...prev, visualTags: dna }));
                    }
                }

                const { beatSheet, assets, scenes } = await generateBeatSheet(
                    chunk.episodeData, chunk.batchMeta, language, globalStyle, globalAssetsRef.current, chunk.text
                );

                // Pre-generate prompts for beat-extracted assets
                let enrichedBeatAssets = assets;
                try {
                    const promptResult = await buildAssetPrompts(assets, globalStyle);
                    enrichedBeatAssets = promptResult.assets;
                } catch (e) { console.warn('Pre-gen prompts failed:', e); }

                // Merge into global (update fields, preserve existing refImageUrl)
                const currentAssets = globalAssetsRef.current;
                const previousIds = chunk.assets.map(a => a.id);
                const newAssetIds = enrichedBeatAssets.map(a => a.id);
                const { merged, hasChanges } = mergeAssetsIntoGlobal(currentAssets, enrichedBeatAssets);
                // Conditionally prune orphaned assets from global
                const pruned = pruneOrphanedGlobalAssets(merged, previousIds, newAssetIds, chunks, chunk.id);
                if (hasChanges || pruned !== merged) setGlobalAssets(pruned);

                // Use latest extracted assets for the chunk
                const chunkAssets = enrichedBeatAssets.map(a => {
                    return pruned.find(g => g.id === a.id) || a;
                });

                updateChunk(chunk.id, {
                    status: 'storyboarded',
                    scenes,
                    beatSheet,
                    assets: chunkAssets,
                });
                return scenes;
            }
            throw new Error("No episodeData available for beat generation");
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    // --- Step 2: Generate Prompts from cached BeatSheet → scripted ---
    const handleGeneratePrompts = async (chunk: NovelChunk, initialTargetSceneIds?: string[], onProgressCb?: (activeId: string | null, completedIds: string[]) => void) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Prompt generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (!chunk.beatSheet) throw new Error("No beat sheet found. Please generate storyboard first.");
            const epNum = chunk.episodeData?.episode_number || 0;

            // Use latest assets and sync beats with user edits (already handled)
            const chunkAssetIds = new Set(chunk.assets.map(a => a.id));
            const borrowedAssets = globalAssetsRef.current.filter(
                a => !chunkAssetIds.has(a.id) && chunk.scenes.some(s => s.assetIds?.includes(a.id))
            );
            const latestAssets = [...chunk.assets, ...borrowedAssets];

            const sceneMap = new Map(chunk.scenes.map(s => [s.id, s]));
            
            // local state to keep track of scenes during automatic retries
            let liveScenes = [...chunk.scenes];
            let currentTargetIds = initialTargetSceneIds;
            let finalVisualDna = '';
            
            let globalCompletedIds = new Set<string>();
            let attempt = 0;
            const MAX_ATTEMPTS = 3;
            
            while (attempt < MAX_ATTEMPTS) {
                try {
                    const livingSceneIds = new Set(liveScenes.map(s => s.id));
                    const filteredBeats = (chunk.beatSheet.beats || []).filter((beat: any) => {
                        const sceneId = `E${epNum}_${beat.beat_id}`;
                        if (!livingSceneIds.has(sceneId)) return false;
                        if (currentTargetIds && !currentTargetIds.includes(sceneId)) return false;
                        return true;
                    });
                    
                    if (filteredBeats.length === 0) break; // All requested scenes have prompts!

                    const userSyncedBeats = filteredBeats.map((beat: any) => {
                        const scene = sceneMap.get(`E${epNum}_${beat.beat_id}`);
                        if (!scene) return beat;
                        const updated = { ...beat };
                        const originalDesc = `[${beat.shot_name || beat.shot_id || ''}] ${beat.visual_action || ''}`;
                        if (scene.visual_desc && scene.visual_desc !== originalDesc) {
                            updated.visual_action = scene.visual_desc;
                        }
                        if (scene.video_camera && scene.video_camera !== (beat.camera_movement || '')) {
                            updated.camera_movement = scene.video_camera;
                        }
                        if (scene.video_lens && scene.video_lens !== (beat.shot_id || '')) {
                            updated.shot_id = scene.video_lens;
                        }
                        if (scene.audio_sfx && scene.audio_sfx !== (beat.audio_subtext || '')) {
                            updated.audio_subtext = scene.audio_sfx;
                        }
                        return updated;
                    });
                    const syncedBeatSheet = { ...chunk.beatSheet, beats: userSyncedBeats };
                    
                    if (onProgressCb && filteredBeats.length > 0) {
                        const firstActiveId = `E${epNum}_${filteredBeats[0].beat_id}`;
                        onProgressCb(firstActiveId, Array.from(globalCompletedIds));
                    }

                    await generatePromptsFromBeatsStream(
                        syncedBeatSheet, epNum, language, latestAssets, globalStyle,
                        (progressScenes, dna) => {
                            if (dna) finalVisualDna = dna;
                            
                            let currentActiveId: string | null = null;
                            const currentCompletedIds = new Set(globalCompletedIds);

                            if (progressScenes.length > 0) {
                                currentActiveId = progressScenes[progressScenes.length - 1].id;
                                for (let i = 0; i < progressScenes.length - 1; i++) {
                                    currentCompletedIds.add(progressScenes[i].id);
                                }
                            }
                            
                            if (onProgressCb) {
                                onProgressCb(currentActiveId, Array.from(currentCompletedIds));
                            }
                            
                            // Update our local live tracking array
                            liveScenes = liveScenes.map(old => {
                                const ns = progressScenes.find(s => s.id === old.id);
                                if (!ns) return old;
                                
                                // Deep merge for prompt_options (A/B/C variants)
                                const mergedOptions = ns.prompt_options?.map(newOpt => {
                                    const oldOpt = old.prompt_options?.find(o => o.option_id === newOpt.option_id);
                                    if (!oldOpt) return newOpt;
                                    return {
                                        ...newOpt,
                                        imageUrl: oldOpt.imageUrl,
                                        imageAssetId: oldOpt.imageAssetId,
                                        videoUrl: oldOpt.videoUrl,
                                        videoAssetId: oldOpt.videoAssetId,
                                        videoAssetIds: oldOpt.videoAssetIds,
                                        assetIds: oldOpt.assetIds,
                                    };
                                });

                                return {
                                    ...ns,
                                    imageUrl: old.imageUrl,
                                    imageAssetId: old.imageAssetId,
                                    videoUrl: old.videoUrl,
                                    videoAssetId: old.videoAssetId,
                                    startEndVideoUrl: old.startEndVideoUrl,
                                    startEndVideoAssetId: old.startEndVideoAssetId,
                                    narrationAudioUrl: old.narrationAudioUrl,
                                    prompt_options: mergedOptions || old.prompt_options, 
                                    assetIds: old.assetIds || ns.assetIds,
                                    videoAssetIds: old.videoAssetIds || ns.videoAssetIds,
                                    startEndAssetIds: old.startEndAssetIds || ns.startEndAssetIds,
                                    useAssets: old.useAssets !== undefined ? old.useAssets : ns.useAssets,
                                    isStartEndFrameMode: old.isStartEndFrameMode !== undefined ? old.isStartEndFrameMode : ns.isStartEndFrameMode,
                                    video_duration: old.video_duration || ns.video_duration,
                                    video_vfx: old.video_vfx || ns.video_vfx,
                                };
                            });

                            // And push to React state
                            setChunks(prev => prev.map(c => {
                                if (c.id !== chunk.id) return c;
                                return { ...c, scenes: liveScenes, status: 'scripting' };
                            }));
                        }
                    );
                    
                    // Batch completed successfully
                    filteredBeats.forEach((b: any) => globalCompletedIds.add(`E${epNum}_${b.beat_id}`));
                    if (onProgressCb) {
                        onProgressCb(null, Array.from(globalCompletedIds));
                    }
                    
                    // If stream completed successfully, break out of retry loop!
                    break;
                } catch (streamError: any) {
                    attempt++;
                    console.error(`Prompt generation stream interrupted (Attempt ${attempt}/${MAX_ATTEMPTS})`, streamError);
                    
                    if (attempt >= MAX_ATTEMPTS) {
                        throw streamError;
                    }
                    
                    // Re-calculate missing targets for the next retry!
                    const missingScenes = liveScenes.filter(s => {
                        // It is missing if there is no main prompt and no option prompts
                        const hasMain = !!s.np_prompt?.trim();
                        const hasOpt = s.prompt_options ? s.prompt_options.some(opt => !!opt.np_prompt?.trim()) : false;
                        return !hasMain && !hasOpt;
                    });
                    
                    if (missingScenes.length === 0) {
                        break; // Actually, all were generated before failure!
                    }
                    
                    // If initialTargetSceneIds was provided, we only care about missing scenes that were in the original target
                    currentTargetIds = missingScenes
                        .map(s => s.id)
                        .filter(id => !initialTargetSceneIds || initialTargetSceneIds.includes(id));
                        
                    if (currentTargetIds.length === 0) {
                        break;
                    }
                    
                    // Wait before retry
                    await new Promise(res => setTimeout(res, attempt * 2000));
                }
            }

            // Final Update: Sync Visual DNA ONLY if unlocked and empty
            if (finalVisualDna && !globalStyle.visualDnaLocked && !globalStyle.visualTags) {
                setGlobalStyle(prev => ({ ...prev, visualTags: finalVisualDna }));
            }
            updateChunk(chunk.id, { status: 'scripted' });
            return liveScenes;
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    const handleImportChunk = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const zip = await JSZip.loadAsync(file);
            const dataFile = zip.file("data.json");
            if (!dataFile) throw new Error("Invalid format: data.json missing");

            const jsonStr = await dataFile.async("string");
            const importedData = JSON.parse(jsonStr);
            const newChunk = parseImportData(importedData);

            const restoredAssets: Asset[] = [];
            for (const asset of (importedData.assets || [])) {
                let refImageUrl = asset.refImageUrl;
                let refImageAssetId = asset.refImageAssetId;
                // Try new safe filename first, then legacy format for backward compat
                const imgFile = zip.file(`asset_refs/${asset.id}.png`)
                    || zip.file(`asset_refs/${asset.id}_${asset.name}.png`);
                if (imgFile) {
                    const blob = await imgFile.async("blob");
                    refImageAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(refImageAssetId);
                    if (url) refImageUrl = url;
                }
                restoredAssets.push({ ...asset, refImageUrl, refImageAssetId });
            }
            newChunk.assets = restoredAssets;

            // Import-safe merge: add new assets to global (keep refImageUrl), skip existing
            setGlobalAssets(prev => {
                const next = [...prev];
                restoredAssets.forEach(a => {
                    if (!next.some(existing => existing.id === a.id)) next.push(a);
                });
                return next;
            });

            const restoredScenes: Scene[] = [];
            for (const scene of (importedData.scenes || [])) {
                let imageUrl = scene.imageUrl;
                let imageAssetId = scene.imageAssetId;
                let videoUrl = scene.videoUrl;
                let videoAssetId = scene.videoAssetId;
                let startEndVideoUrl = scene.startEndVideoUrl;
                let startEndVideoAssetId = scene.startEndVideoAssetId;
                let narrationAudioUrl = scene.narrationAudioUrl;

                const imgFile = zip.file(`images/${scene.id}.png`);
                if (imgFile) {
                    const blob = await imgFile.async("blob");
                    imageAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(imageAssetId);
                    if (url) imageUrl = url;
                }
                const vidFile = zip.file(`videos/${scene.id}.mp4`);
                if (vidFile) {
                    const blob = await vidFile.async("blob");
                    videoAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(videoAssetId);
                    if (url) videoUrl = url;
                }
                const seVidFile = zip.file(`videos/${scene.id}_startend.mp4`);
                if (seVidFile) {
                    const blob = await seVidFile.async("blob");
                    startEndVideoAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(startEndVideoAssetId);
                    if (url) startEndVideoUrl = url;
                }
                const audioFile = zip.file(`narration/${scene.id}_narration.wav`);
                if (audioFile) {
                    const blob = await audioFile.async("blob");
                    const audioAssetId = await saveAsset(blob);
                    const audioUrl = await loadAssetUrl(audioAssetId);
                    if (audioUrl) narrationAudioUrl = audioUrl;
                }

                restoredScenes.push({ ...scene, imageUrl, imageAssetId, videoUrl, videoAssetId, startEndVideoUrl, startEndVideoAssetId, narrationAudioUrl });
            }
            newChunk.scenes = restoredScenes;

            if (newChunk.scenes.length > 0) {
                if (newChunk.scenes.every(s => !!s.videoUrl || !!s.videoAssetId)) newChunk.status = 'completed';
                else if (newChunk.scenes.every(s => !!s.imageUrl || !!s.imageAssetId)) newChunk.status = 'shooting';
            }

            setChunks(prev => [...prev, newChunk]);
        } catch (err: any) {
            console.error("Import failed", err);
            alert((language === 'Chinese' ? "导入失败: " : "Import Failed: ") + err.message);
        } finally {
            e.target.value = '';
        }
    };

    const handleAnalyze = async (manualText: string, episodeCount?: number, isRegenerate?: boolean) => {
        if (isAnalyzingRef.current) {
            console.warn('Analysis already in progress, skipping duplicate call.');
            return;
        }

        if (isRegenerate) {
            const confirmed = window.confirm(language === 'Chinese' 
                ? "重新生成将删除当前所有的分镜脚本以及角色/场景资产库，是否继续？" 
                : "Regenerating will delete all current storyboard scripts and assets. Continue?");
            if (!confirmed) return;

            // Clear old data
            setChunks([]);
            setGlobalAssets([]);
            if (!globalStyle.visualDnaLocked) {
                setGlobalStyle(prev => ({ ...prev, visualTags: '' }));
            }
        }

        isAnalyzingRef.current = true;
        setStatus(AnalysisStatus.ANALYZING);
        setAnalysisProgress(language === 'Chinese' ? "准备分析..." : "Initializing...");

        const textToUse = filename ? fullNovelText : manualText;
        if (!filename && manualText !== fullNovelText) {
            setFullNovelText(manualText);
        }

        const directorName = globalStyle.director.custom || (globalStyle.director.selected !== 'None' ? globalStyle.director.selected : '') || '';

        analyzeNarrative(textToUse, language, "", episodeCount,
            (msg) => setAnalysisProgress(msg),
            undefined,
            directorName,
            globalStyle.director.strength
        )
            .then(blueprint => {
                if (blueprint && blueprint.episodes && blueprint.episodes.length > 0) {
                    const newChunks: NovelChunk[] = blueprint.episodes.map((ep, idx) => ({
                        id: `ep_${Date.now()}_${ep.episode_number}_${idx}`,
                        index: ep.episode_number - 1,
                        title: `Ep ${ep.episode_number}: ${ep.title}`,
                        text: `### Episode ${ep.episode_number}: ${ep.title}\n\n**Logline**: ${ep.logline}\n\n**Script**:\n${ep.script || ''}`,
                        status: 'idle',
                        assets: [],
                        scenes: [],
                        episodeData: ep,
                        batchMeta: blueprint.batch_meta
                    }));

                    setChunks(prev => {
                        if (isRegenerate) return newChunks; // Replace entirely
                        const existingEps = new Set(prev.map(c => c.episodeData?.episode_number));
                        const uniqueNewChunks = newChunks.filter(c => !existingEps.has(c.episodeData?.episode_number));
                        if (uniqueNewChunks.length === 0) return prev;
                        const merged = [...prev, ...uniqueNewChunks];
                        return merged.sort((a, b) => (a.episodeData?.episode_number || 0) - (b.episodeData?.episode_number || 0));
                    });
                }
            })
            .catch(e => {
                console.error("Agent 1 Failed, using fallback:", e);
                fallbackChunking(textToUse);
            })
            .finally(() => {
                isAnalyzingRef.current = false;
                setStatus(AnalysisStatus.IDLE);
                setAnalysisProgress("");
            });
    };

    return {
        updateChunk,
        handleLoadNovel,
        handleChunkExtract,
        handleManualExtractAssets,
        handleChunkScript,
        handleGenerateBeats,
        handleGeneratePrompts,
        handleImportChunk,
        handleAnalyze,
        extractingChunksRef,
        scriptingChunksRef
    };
}
