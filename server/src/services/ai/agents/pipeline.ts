import { Scene, Asset, GlobalStyle } from "../../../shared/types";
import { toCompactLensLibrary } from "../../../domain/generation/core-lenses";
import { wait } from "../helpers";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";
import { runAgent1_NarrativeAnalysis } from "./agent1-narrative";
import { runAgent2_Annotation } from "./agent2-visual";
import { runAgent3_AssetProduction, runAgent3_AssetProductionStream } from "./agent3-asset";
import { extractAssetsFromBeats } from "../style/index";
import { segmentScript, countBeatSegments } from "./script-segmenter";
import { computeStylePrefix } from "../media/image";
export { computeStylePrefix };

// --- HELPER for Agent 2/3 Retry with Validation ---
export async function executeWithRetryAndValidation<T>(
    operation: () => Promise<T>,
    validator: (result: T) => boolean,
    agentName: string,
    contextInfo: any,
    maxRetries: number = 5,
    signal?: AbortSignal
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        try {
            const result = await operation();
            if (validator(result)) {
                return result;
            }
            throw new Error(`Validation failed: Result is empty or invalid.`);
        } catch (e: any) {
            if (e.name === 'AbortError' || e.message === 'Aborted' || signal?.aborted) {
                throw e;
            }
            lastError = e;
            const delay = Math.pow(2, i) * 1000;
            await new Promise<void>((resolve, reject) => {
                const t = setTimeout(() => {
                    if (signal) signal.removeEventListener('abort', abortHandler);
                    resolve();
                }, delay);
                const abortHandler = () => {
                    clearTimeout(t);
                    reject(new Error("Aborted"));
                };
                if (signal) signal.addEventListener('abort', abortHandler);
            });
        }
    }
    throw new Error(`[${agentName}] Execution failed after ${maxRetries} retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// --- Narrative Analysis (Agent 1) ---
export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    onProgress?: (msg: string) => void,
    onBatchComplete?: (episodes: any[], meta: any) => void,
    directorStyle?: string,
    directorStrength?: number,
    signal?: AbortSignal
): Promise<NarrativeBlueprint> => {
    return await runAgent1_NarrativeAnalysis(text, language, prevContext, episodeCount, onProgress, onBatchComplete, directorStyle, directorStrength, signal);
};

// --- Step 1: Generate Beat Sheet + Extract Assets ---
export const generateBeatSheet = async (
    episode: any,
    batch_meta: any,
    language: string,
    style: GlobalStyle,
    existingAssets: Asset[] = [],
    overrideText?: string,
    signal?: AbortSignal
): Promise<{ beatSheet: MasterBeatSheet; assets: Asset[]; scenes: Scene[] }> => {
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;

    let singleEpBlueprint: any;
    if (overrideText) {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [{
                ...episode,
                _USER_EDITED_CONTENT_STRICT_: overrideText,
                _INSTRUCTION_TO_AGENT_2_: "CRITICAL: The user has MANUALLY EDITED the script content. IGNORE the 'script' field below if it conflicts. Generate beats based strictly on the '_USER_EDITED_CONTENT_STRICT_' field above."
            }]
        };
    } else {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [episode]
        };
    }

    const compactLensLibrary = toCompactLensLibrary();

    // AI 导演模式：不再由程序预分段，改为由 AI 导演直接处理全文
    const scriptText = overrideText || episode.script || '';
    
    console.log(`[Pipeline] AI DIRECTOR mode: Analyzing full script...`);

    // 准备叙事上下文
    const visualDna = style.visualTags || "";
    const narrativeContext = JSON.stringify({
        logline: episode.logline || "",
        pacing: episode.pacing_structure || {},
        character_instructions: episode.character_instructions || {}
    }, null, 2);

    const beatSheet = await executeWithRetryAndValidation(
        () => runAgent2_Annotation(scriptText, language, compactLensLibrary, visualDna, narrativeContext, signal),
        (res) => res && Array.isArray(res.beats) && res.beats.length > 0,
        "Agent 2 (Full Director)",
        { episode: episode.episode_number, language },
        2,
        signal
    );

    // ------------------- 新增：资产提取与智能继承逻辑 -------------------
    
    // 辅助函数：根据剧本文本自动兜底继承已有资产
    const enrichWithExisting = (extracted: Asset[], existing: Asset[], beatsText: string) => {
        // 提取出的资产名称集合，用于排重
        const extractedNames = new Set(extracted.map(a => a.name));
        const extractedIds = new Set(extracted.map(a => a.id));
        
        // 查找在剧本中出现，且未被 LLM 提取 of 已有资产
        const inherited = existing.filter(ea => {
            const isNotExtracted = !extractedNames.has(ea.name) && !extractedIds.has(ea.id);
            // 简单粗暴的文本包含匹配（可涵盖绝大多数人名/道具名）
            const isMentionedInScript = beatsText.includes(ea.name);
            return isNotExtracted && isMentionedInScript;
        });
        
        if (inherited.length > 0) {
            console.log(`[Pipeline] Auto-inherited ${inherited.length} existing assets:`, inherited.map(a => a.name).join(', '));
        }
        
        return [...extracted, ...inherited];
    };

    // 将剧本中所有分镜的视觉描述拼接成一整段长文本，供文本匹配使用
    const fullBeatsText = (beatSheet.beats || []).map((b: any) => b.visual_action || '').join(' ');

    // 第 1 次提取
    let rawBeatAssets = await extractAssetsFromBeats(beatSheet, language, existingAssets, workStyle, useOriginalCharacters, signal);
    let beatAssets = enrichWithExisting(rawBeatAssets, existingAssets, fullBeatsText);

    // 智能重试：兜底后如果依然为 0，大概率是空镜剧本。只允许 1 次额外重试，防止大模型抽风漏掉“全新角色”。
    let attempts = 1;
    while (beatAssets.length === 0 && attempts < 2) {
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        console.warn(`[generateBeatSheet] Asset extraction returned empty, fast retry ${attempts}/1...`);
        rawBeatAssets = await extractAssetsFromBeats(beatSheet, language, existingAssets, workStyle, useOriginalCharacters, signal);
        beatAssets = enrichWithExisting(rawBeatAssets, existingAssets, fullBeatsText);
        attempts++;
    }

    // 破除死锁：移除 throw Error。如果重试后依然为 0，视为正常空镜（风景/环境展示）
    if (beatAssets.length === 0) {
        console.warn('[Pipeline] Asset extraction yielded 0 assets after inheritance. Proceeding with empty asset list (scenic/abstract script).');
    }
    // ------------------------------------------------------------------

    const epNum = episode.episode_number || 0;
    const emptyScenes: Scene[] = beatSheet.beats.map((beat: any) => ({
        id: `E${epNum}_${beat.beat_id}`,
        narration: beat.visual_action || '',
        visual_desc: `[${beat.shot_name || beat.shot_id || ''}] ${beat.visual_action || ''}`,
        np_prompt: '',
        video_prompt: '',
        audio_sfx: beat.audio_subtext || '',
        audio_dialogue: [],
        assetIds: [],
    }));

    return { beatSheet, assets: beatAssets, scenes: emptyScenes };
};

// --- Step 2: Generate Prompts from cached BeatSheet ---
export const generatePromptsFromBeats = async (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    signal?: AbortSignal
): Promise<{ scenes: Scene[]; visualDna: string }> => {
    // 锁定后的DNA直接从 style.visualTags 读取
    // computeStylePrefix 会处理 1:1 还原等特殊逻辑
    let visualDna = style.visualTags || '';
    
    const stylePrefix = computeStylePrefix(style);

    const scenes = await executeWithRetryAndValidation(
        () => runAgent3_AssetProduction(beatSheet, language, assets, stylePrefix, style.aspectRatio || '16:9', undefined, signal),
        (res) => res && Array.isArray(res) && res.length > 0,
        "Agent 3 (Asset Producer)",
        { beatCount: beatSheet.beats.length },
        1, // Agent 3 handles retries internally
        signal
    );

    const labeledScenes = scenes.map(scene => ({
        ...scene,
        id: `E${episodeNumber}_${scene.id}`
    }));

    return { scenes: labeledScenes, visualDna };
};

export const generatePromptsFromBeatsStream = async function* (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    signal?: AbortSignal
): AsyncGenerator<{ scenes: Scene[]; visualDna?: string }> {
    let visualDna = style.visualTags || '';
    const stylePrefix = computeStylePrefix(style);

    let firstChunk = true;
    for await (const chunk of runAgent3_AssetProductionStream(beatSheet, language, assets, stylePrefix, style.aspectRatio || '16:9', undefined, signal)) {
        if (!chunk || chunk.length === 0) continue;
        
        const labeledScenes = chunk.map(scene => ({
            ...scene,
            id: `E${episodeNumber}_${scene.id}`
        }));

        if (firstChunk) {
            yield { scenes: labeledScenes, visualDna };
            firstChunk = false;
        } else {
            yield { scenes: labeledScenes };
        }
    }
};

// --- Legacy: Combined function ---
export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string,
    signal?: AbortSignal
): Promise<Scene[]> => {
    const { beatSheet } = await generateBeatSheet(episode, batch_meta, language, style, assets, overrideText, signal);
    const result = await generatePromptsFromBeats(beatSheet, episode.episode_number, language, assets, style, signal);
    return result.scenes;
};
