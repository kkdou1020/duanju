import { GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { NarrativeBlueprint } from "./types";

// --- AGENT 1: NARRATIVE ARCHITECT ---

export const runAgent1_NarrativeAnalysis = async (
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
    if (onProgress) {
        onProgress(`Generating Narrative Blueprint...`);
    }

    let batches: { start: number, end: number }[] = [{ start: 1, end: -1 }];
    let isSplitMode = false;
    const MAX_EPISODES_PER_BATCH = 3;

    if (episodeCount && episodeCount > 0) {
        if (episodeCount > MAX_EPISODES_PER_BATCH) {
            isSplitMode = true;
            batches = [];
            for (let i = 1; i <= episodeCount; i += MAX_EPISODES_PER_BATCH) {
                const end = Math.min(i + MAX_EPISODES_PER_BATCH - 1, episodeCount);
                batches.push({ start: i, end: end });
            }
        } else {
            batches = [{ start: 1, end: episodeCount }];
        }
    } else {
        if (text.length > 100000) {
            const estimatedCount = Math.min(Math.ceil(text.length / 10000), 60);

            isSplitMode = true;
            batches = [];
            for (let i = 1; i <= estimatedCount; i += MAX_EPISODES_PER_BATCH) {
                const end = Math.min(i + MAX_EPISODES_PER_BATCH - 1, estimatedCount);
                batches.push({ start: i, end: end });
            }
            episodeCount = estimatedCount;
        }
    }

    let allEpisodes: any[] = [];
    let finalBatchMeta: any = { narrative_state: { current_tension: "Low", open_loops: [] } };
    let latestCliffhanger = "";

    for (let i = 0; i < batches.length; i++) {
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        const batch = batches[i];
        const currentBatchNum = i + 1;
        const totalBatches = batches.length;
        const episodeRange = isSplitMode ? `Episodes ${batch.start}-${batch.end}` : "Auto-Distribution";

        if (onProgress) onProgress(isSplitMode ? `Generating Narrative Blueprint (Batch ${currentBatchNum}/${totalBatches})...` : `Generating Narrative Blueprint...`);

        let episodeInstruction = "";
        if (isSplitMode) {
            episodeInstruction = `- **强制分集 (Batch ${currentBatchNum}/${totalBatches})**: 
            本批次任务是生成 **第 ${batch.start} 集 到 第 ${batch.end} 集** (共 ${batch.end - batch.start + 1} 集)。
            
            **CRITICAL NARRATIVE SCOPE (叙事范围约束)**:
            ${i === 0
                    ? "1. **YOU MUST NOT FINISH THE STORY**. \n2. Cover ONLY the initial setup and inciting incidents for these episodes. \n3. STOP exactly at the designated end episode. \n4. The last episode MUST end on a CLIFFHANGER."
                    : (i === totalBatches - 1
                        ? "1. **FINAL STRETCH**: Drive the story to its Conclusion. \n2. Resolve all major conflicts. \n3. Provide a satisfying ending in the final episode."
                        : "1. **MIDDLE ACT**: Continue the story from the previous batch. \n2. Develop the conflicts and rising action. \n3. Do NOT finish the story yet. \n4. Maintain narrative continuity.")
                }
            
            必须严格按照编号生成，不得跳号，不得重复。确保每一集都有独立的核心冲突。`;
        } else if (episodeCount && episodeCount > 0) {
            episodeInstruction = `- **强制分集**: 用户指定了生成 **${episodeCount} 集**。你必须严格将输入内容划分为 ${episodeCount} 集。`;
        } else {
            episodeInstruction = "- **智能分集**: 根据输入文本的体量 and 剧情起伏，将其自动划分为 N 集（每集 3-5 分钟）。";
        }

        const narrativeSchema = {
            type: Type.OBJECT,
            properties: {
                batch_meta: {
                    type: Type.OBJECT,
                    properties: {
                        narrative_state: {
                            type: Type.OBJECT,
                            properties: {
                                current_tension: { type: Type.STRING },
                                open_loops: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        },
                        batch_info: {
                            type: Type.OBJECT,
                            properties: {
                                batch_index: { type: Type.NUMBER },
                                total_batches: { type: Type.NUMBER },
                                episode_range: { type: Type.STRING },
                                timestamp: { type: Type.STRING }
                            }
                        }
                    }
                },
                episodes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            episode_number: { type: Type.NUMBER },
                            title: { type: Type.STRING },
                            logline: { type: Type.STRING },
                            pacing_structure: {
                                type: Type.OBJECT,
                                properties: {
                                    hook: { type: Type.STRING },
                                    inciting_incident: { type: Type.STRING },
                                    twists: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    cliffhanger: { type: Type.STRING }
                                },
                                required: ["hook", "twists", "cliffhanger"]
                            },
                            script: { type: Type.STRING },
                            character_instructions: { type: Type.OBJECT },
                            mentioned_chapters: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["episode_number", "title", "script"]
                    }
                }
            },
            required: ["episodes"]
        };

        const MAX_BATCH_RETRIES = 3;
        let batchSuccess = false;

        for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
            if (signal?.aborted) {
                throw new Error("Aborted");
            }
            try {
                if (attempt > 1 && onProgress) {
                    onProgress(`[Agent1][Batch ${currentBatchNum}/${totalBatches}][Retry ${attempt}/${MAX_BATCH_RETRIES}]...`);
                }

                const combinedContext = prevContext + (latestCliffhanger ? `\n\n${latestCliffhanger}` : "");

                const sysPrompt = PROMPTS.AGENT_1_NARRATIVE({
                    batchInstruction: episodeInstruction,
                    language,
                    text,
                    prevContext: combinedContext,
                    isBatched: isSplitMode,
                    episodeRange,
                    currentBatchNum,
                    totalBatches,
                    directorStyle,
                    directorStrength
                });

                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: MODELS.TEXT_FAST,
                    contents: { parts: [{ text: `Analyze the text and generate COMPLETE SCREENPLAY SCRIPTS (剧本) for ${episodeRange}. Each episode MUST have a full 'script' field (≥3000 chars, target 5000+). The script field must NOT be empty.` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json",
                        responseSchema: narrativeSchema,
                        maxOutputTokens: 65536,
                        signal
                    }
                }), 3, 5000, undefined, signal);

                console.debug(`[Agent1] Batch ${currentBatchNum}/${totalBatches} raw response received (${(response.text || '').length} chars)`);

                let result = safeJsonParse<NarrativeBlueprint>(response.text, {
                    batch_meta: { narrative_state: { current_tension: "Low", open_loops: [] } },
                    episodes: []
                });

                if (Array.isArray(result) && result.length > 0) {
                    if (result[0].episodes) {
                        console.warn(`[Agent1] Response wrapped in array (nested format), unwrapping.`);
                        result = result[0] as NarrativeBlueprint;
                    }
                    else if (result.some((item: any) => item.episode_number !== undefined)) {
                        console.warn(`[Agent1] Response is a flat array, reassembling into NarrativeBlueprint.`);
                        const metaItem = result.find((item: any) => item.batch_meta) as any;
                        const episodes = result.filter((item: any) => item.episode_number !== undefined);
                        result = {
                            batch_meta: metaItem?.batch_meta || { narrative_state: { current_tension: "Low", open_loops: [] } },
                            episodes
                        } as NarrativeBlueprint;
                    } else {
                        console.warn(`[Agent1] Response is an unrecognized array format, using first element.`);
                        result = result[0] as NarrativeBlueprint;
                    }
                }

                if (result.episodes && result.episodes.length > 0) {
                    if (isSplitMode) {
                        result.episodes.forEach((ep, idx) => {
                            const expectedNum = batch.start + idx;
                            if (ep.episode_number !== expectedNum) {
                                ep.episode_number = expectedNum;
                            }
                        });
                    }

                    const validEpisodes = result.episodes.filter(ep => {
                        if (!isSplitMode) return true;
                        return ep.episode_number >= batch.start && ep.episode_number <= batch.end;
                    });

                    if (validEpisodes.length > 0) {
                        // Clean up JSON leakage artifacts that Gemini sometimes hallucinates at the end of long strings
                        validEpisodes.forEach(ep => {
                            if (ep.script) {
                                ep.script = ep.script.replace(/",\s*(title|episode_number|logline|pacing_structure|character_instructions|mentioned_chapters)"?\s*:\s*.*$/is, '').trim();
                                ep.script = ep.script.replace(/",\s*title:\s*.*$/is, '').trim();
                            }
                        });

                        allEpisodes.push(...validEpisodes);
                        finalBatchMeta = result.batch_meta;

                        const lastEp = validEpisodes[validEpisodes.length - 1];
                        latestCliffhanger = `[Previous Batch Summary]: Ended at Episode ${lastEp.episode_number}. \nLast Episode Script Ending: "${(lastEp.script || '').slice(-200)}". \n\n**INSTRUCTION**: You MUST start Episode ${lastEp.episode_number + 1} by resolving or escalating the cliffhanger from the previous episode. Maintain seamless narrative continuity. Do NOT restart the story.`;

                        if (onBatchComplete) {
                            onBatchComplete(validEpisodes, finalBatchMeta);
                        }
                        batchSuccess = true;
                        break;
                    }
                }

                console.warn(`[Agent1][Batch ${currentBatchNum}/${totalBatches}][Retry ${attempt}/${MAX_BATCH_RETRIES}] returned no valid episodes.`);
            } catch (e: any) {
                if (e.name === 'AbortError' || e.message === 'Aborted' || signal?.aborted) {
                    throw e;
                }
                console.error(`[Agent1][Batch ${currentBatchNum}/${totalBatches}][Retry ${attempt}/${MAX_BATCH_RETRIES}] failed:`, e?.message || e);
                if (attempt < MAX_BATCH_RETRIES) {
                    await new Promise<void>((resolve, reject) => {
                        const t = setTimeout(() => {
                            if (signal) signal.removeEventListener('abort', abortHandler);
                            resolve();
                        }, Math.pow(2, attempt) * 2000);
                        const abortHandler = () => {
                            clearTimeout(t);
                            reject(new Error("Aborted"));
                        };
                        if (signal) signal.addEventListener('abort', abortHandler);
                    });
                }
            }
        }

        if (!batchSuccess) {
            const msg = `[Agent1][Batch ${currentBatchNum}/${totalBatches}] Episodes ${batch.start}-${batch.end} failed after ${MAX_BATCH_RETRIES} retries.`;
            console.error(msg);
            if (onProgress) onProgress(`⚠ Batch ${currentBatchNum}/${totalBatches} failed after ${MAX_BATCH_RETRIES} retries.`);
            throw new Error(msg);
        }
    }

    return {
        batch_meta: finalBatchMeta,
        episodes: allEpisodes
    };
};
