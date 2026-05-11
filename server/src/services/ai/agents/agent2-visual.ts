import { GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";
import { ScriptSegment, formatSegmentsForAnnotation, countBeatSegments } from "./script-segmenter";

// --- AGENT 2: VISUAL DIRECTOR ---

const MAX_RETRIES = 3;

const agent2Schema = {
    type: Type.OBJECT,
    properties: {
        visual_strategy: {
            type: Type.OBJECT,
            properties: {
                core_atmosphere: { type: Type.STRING },
                spatial_setup: { type: Type.STRING },
                key_lens_design: {
                    type: Type.OBJECT,
                    properties: {
                        opening_hook: { type: Type.STRING },
                        metaphor: { type: Type.STRING }
                    }
                }
            }
        },
        beats: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    beat_id: { type: Type.STRING },
                    shot_id: { type: Type.STRING },
                    shot_name: { type: Type.STRING },
                    visual_action: { type: Type.STRING },
                    camera_movement: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    audio_subtext: { type: Type.STRING },
                    asset_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                    narrative_function: { type: Type.STRING },
                    spatial_pos: { type: Type.STRING },
                    emotional_intensity: { type: Type.NUMBER }
                },
                required: ["beat_id", "shot_id", "visual_action", "camera_movement", "lighting", "audio_subtext", "narrative_function", "emotional_intensity"]
            }
        }
    },
    required: ["beats"]
};

/**
 * 解析并规范化 Agent2 的 AI 响应
 */
function parseAgent2Response(responseText: string | undefined): MasterBeatSheet {
    let result = safeJsonParse<MasterBeatSheet>(responseText, {
        visual_strategy: { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats: []
    });

    if (Array.isArray(result) && result.length > 0) {
        if (result[0].beats) {
            result = result[0] as MasterBeatSheet;
        } else if (result.some((item: any) => item.beat_id !== undefined)) {
            const strategyItem = result.find((item: any) => item.visual_strategy) as any;
            result = {
                visual_strategy: strategyItem?.visual_strategy || { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
                beats: result.filter((item: any) => item.beat_id !== undefined)
            } as MasterBeatSheet;
        }
    }

    const beats = (result.beats && Array.isArray(result.beats)) ? result.beats : [];
    if (beats.length === 0) {
        throw new Error(`[Agent2] Validation failed: beats array is empty.`);
    }

    beats.sort((a, b) => {
        const numA = parseInt(a.beat_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.beat_id.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    return {
        visual_strategy: result.visual_strategy || { core_atmosphere: "", spatial_setup: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats
    };
}



/**
 * 标注模式：全能导演模式 2.3 (原生符号刚性切分 + LLM 纯填空)
 */
export const runAgent2_Annotation = async (
    rawScript: string,
    language: string,
    lensLibraryPrompt: string,
    visualDna: string = "",
    narrativeContext: string = ""
): Promise<MasterBeatSheet> => {

    // 1. Programmatic splitting by "△"
    const chunks = rawScript.split('△');
    const setupContext = chunks[0].trim(); 
    const beatTexts: string[] = [];
    for (let i = 1; i < chunks.length; i++) {
        if (chunks[i].trim().length > 0) {
            beatTexts.push('△' + chunks[i]); 
        }
    }

    if (beatTexts.length === 0) {
        throw new Error(`[Agent2/PureDirector] Validation failed: No '△' found in script.`);
    }

    // 2. Format input for LLM
    let llmInput = `**已切分的分镜列表 (共 ${beatTexts.length} 个)**:\n`;
    beatTexts.forEach((text, index) => {
        const beatId = `S${String(index + 1).padStart(2, '0')}`;
        llmInput += `[Beat ${beatId}]\n${text.trim()}\n\n`;
    });

    const enhancedNarrativeContext = narrativeContext ? `${narrativeContext}\n\n[前情摘要]: ${setupContext}` : `[前情摘要]: ${setupContext}`;
    const sysPrompt = PROMPTS.AGENT_2_ANNOTATE(language, lensLibraryPrompt, visualDna, enhancedNarrativeContext);

    console.log(`[Agent2/PureDirector] Pre-sliced into ${beatTexts.length} beats. Requesting LLM parameters...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.warn(`[Agent2/PureDirector][Retry ${attempt}/${MAX_RETRIES}] Retrying...`);
            }

            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: { parts: [{ text: `我已经使用代码完成了确切切分。下面是 ${beatTexts.length} 个以 S01 开头编号的分镜文本。请你直接输出对应这些 beat_id 的导演指令 JSON 格式参数（切勿重新输出或修改 raw_text）：\n\n${llmInput}` }] },
                config: {
                    systemInstruction: sysPrompt,
                    responseMimeType: "application/json",
                    responseSchema: agent2Schema
                }
            }));

            const result = parseAgent2Response(response.text);

            // 3. Programmatic Merge: Inject the locked raw texts back into the JSON output
            result.beats = result.beats.map((beat) => {
                const match = beat.beat_id.match(/S?0*(\d+)/);
                const num = match ? parseInt(match[1], 10) : 0;
                const index = num - 1;
                
                const cleanRaw = (index >= 0 && index < beatTexts.length) ? beatTexts[index].trim() : '';
                beat.raw_text = cleanRaw;
                
                let addon = beat.visual_action || '';
                addon = addon.split(cleanRaw).join(''); 
                addon = addon.replace(/原文内容:|\[画面补充\]:|\[场景.*?\]|【场景.*?】/g, '').trim();
                
                // Clean up potential JSON leakage (e.g., ",camera_movement:)
                addon = addon.replace(/",\s*(camera_movement|lighting|audio_subtext|narrative_function|shot_id|shot_name)"?\s*:\s*.*$/is, '').trim();

                let finalAction = `原文内容：${cleanRaw}\n[画面补充]：${addon || '无'}`;
                // Double check for trailing leakage in the entire visual_action
                finalAction = finalAction.replace(/",\s*(camera_movement|lighting|audio_subtext|narrative_function|shot_id|shot_name)"?\s*:\s*.*$/is, '').trim();
                beat.visual_action = finalAction;
                return beat;
            });

            // Fallback validation: Did LLM drop beats?
            if (result.beats.length < beatTexts.length * 0.8 && result.beats.length > 0) {
                console.warn(`[Agent2] LLM returned ${result.beats.length} beats but we expected ${beatTexts.length}. We will pad the missing beats with empty parameters.`);
                // We should ideally generate defaults for missing beats, but throwing might cause infinite retry loops if LLM simply gives up on massive batches.
                // Let's pad missing beats mechanically to ensure strict parity.
                const validBeatsDict = new Map<string, any>();
                result.beats.forEach(b => validBeatsDict.set(b.beat_id, b));
                
                result.beats = beatTexts.map((text, idx) => {
                    const beatId = `S${String(idx + 1).padStart(2, '0')}`;
                    if (validBeatsDict.has(beatId)) {
                        return validBeatsDict.get(beatId);
                    }
                    return {
                        beat_id: beatId,
                        raw_text: text.trim(),
                        shot_id: beatId,
                        shot_name: "Follow-up Shot",
                        visual_action: `原文内容：${text.trim()}\n[画面补充]：无`,
                        camera_movement: "Fixed",
                        lighting: "Natural lighting",
                        audio_subtext: "Ambient sound",
                        narrative_function: "Tension",
                        emotional_intensity: 5
                    };
                });
            }

            console.log(`[Agent2/PureDirector] Success: Emitted ${result.beats.length} beats. Text integrity preserved programmatically.`);
            return result;
        } catch (e: any) {
            console.error(`[Agent2/PureDirector][Retry ${attempt}/${MAX_RETRIES}] failed:`, e?.message || e);
            if (attempt >= MAX_RETRIES) {
                throw new Error(`[Agent2/PureDirector] Failed after ${MAX_RETRIES} retries: ${e?.message || e}`);
            }
            await wait(Math.pow(2, attempt) * 2000);
        }
    }

    throw new Error(`[Agent2/PureDirector] Exhausted all retries.`);
};

