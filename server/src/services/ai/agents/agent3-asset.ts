import { Scene, Asset, GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { toDetailedLensLibrary } from "../../../domain/generation/core-lenses";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { MasterBeatSheet } from "./types";
import { ASSET_TAG_REGEX, resolveTagToAsset, injectTagIds, isStoryboardTag } from "../../../shared/asset-tags";
export const textuallyInjectTags = (text: string, sortedAssets: Asset[]) => {
    if (!text) return text;
    let newText = text;
    
    for (const asset of sortedAssets) {
        // 仅针对两字以上的中文名称，或者纯英文字母代号（如 Z、K）进行替换
        if (asset.name.length >= 2 || /^[a-zA-Z0-9]+$/.test(asset.name)) {
            let escapedName = asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            escapedName = escapedName
                .replace(/\\\(/g, '__PAREN_START__')
                .replace(/\\\)/g, '__PAREN_END__')
                .replace(/（/g, '__PAREN_START__')
                .replace(/）/g, '__PAREN_END__')
                .replace(/__PAREN_START__/g, '[\\(（]')
                .replace(/__PAREN_END__/g, '[\\)）]');
            
            const regexPattern = /^[a-zA-Z0-9]+$/.test(asset.name) 
                ? `(?<![a-zA-Z0-9_])${escapedName}(?![a-zA-Z0-9_])`
                : `(?<!@图像_)(?<!\\[@图像_)${escapedName}`;
                
            const regex = new RegExp(regexPattern, 'g');
            newText = newText.replace(regex, `[@图像_${asset.name}#${asset.id}]`);
        }
    }
    return newText;
};

// --- AGENT 3: ASSET PRODUCER ---

export const runAgent3_AssetProductionStream = async function* (
    beatSheet: MasterBeatSheet,
    language: string,
    assets: Asset[],
    stylePrefix: string,
    aspectRatio: string = '16:9',
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
): AsyncGenerator<Scene[], void, unknown> {
    // 核心修改：让 Agent 3 彻底放弃标签格式，只看纯名字，彻底消除大模型格式幻觉，也避免与 Agent 4 的标签化发生套娃覆盖。
    const assetMap = assets.map(a => `- ${a.name} → DNA: ${a.visualDna || ''}, Desc: ${a.description}`).join('\n');

    const usedShotIds = [...new Set((beatSheet.beats || []).map(b => b.shot_id).filter(Boolean))] as string[];
    const filteredLensLibrary = toDetailedLensLibrary(usedShotIds);

    const sysPrompt = PROMPTS.AGENT_3_ASSET_PRODUCER(filteredLensLibrary, language, stylePrefix, assetMap, aspectRatio);

    const allBeats = beatSheet.beats || [];
    if (allBeats.length === 0) return;

    // 动态批处理：为防止 3 个选项输出极其庞大导致的 LLM 复制粘贴“偷懒现象”，强制单流单次处理。
    const MAX_BEATS_PER_BATCH = 1;
    const totalBeats = allBeats.length;
    const batchCount = Math.max(1, Math.ceil(totalBeats / MAX_BEATS_PER_BATCH));
    const batchSize = Math.ceil(totalBeats / batchCount);

    let allScenes: Scene[] = [];
    let prevBatchEndContext = '';

    for (let i = 0; i < batchCount; i++) {
        if (signal?.aborted) {
            console.log('[Agent 3] Task aborted early. Stopping stream.');
            throw new Error("Aborted");
        }
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalBeats);
        if (start >= totalBeats) break;

        const batchBeats = allBeats.slice(start, end);
        const beatsStr = JSON.stringify(batchBeats);

        const agent3Schema = {
            type: Type.OBJECT,
            properties: {
                scenes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            narration: { type: Type.STRING },
                            visual_desc: { type: Type.STRING },
                            prompt_options: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        option_id: { type: Type.STRING },
                                        lens_reference: {
                                            type: Type.OBJECT,
                                            properties: {
                                                shot_name: { type: Type.STRING },
                                                description: { type: Type.STRING },
                                                searchKeyword: { type: Type.STRING },
                                                video_url: { type: Type.STRING },
                                                timestamp: { type: Type.STRING }
                                            },
                                            required: ["shot_name", "description"]
                                        },
                                        video_prompt: { type: Type.STRING },
                                        np_prompt: { type: Type.STRING },
                                        camera: { type: Type.STRING },
                                        lens: { type: Type.STRING },
                                        focal_length: { type: Type.STRING },
                                        aperture: { type: Type.STRING }
                                    }
                                }
                            },
                            audio_dialogue: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        speaker: { type: Type.STRING },
                                        text: { type: Type.STRING }
                                    },
                                    required: ["speaker", "text"]
                                }
                            },
                            audio_sfx: { type: Type.STRING },
                            audio_bgm: { type: Type.STRING },
                            assetIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["id", "narration", "visual_desc", "audio_dialogue", "prompt_options"]
                    }
                }
            },
            required: ["scenes"]
        };

        const MAX_BATCH_RETRIES = 3;
        let batchSuccess = false;

        const prevBatchLastBeatId = i > 0 ? allBeats[start - 1]?.beat_id : null;
        const continuityHint = prevBatchEndContext && prevBatchLastBeatId
            ? `\n⚠️ 衔接锚点: 上一个片段结束镜头为 [@图像_分镜${prevBatchLastBeatId}]，画面内容: "${prevBatchEndContext}"\n本批次第一个 beat（${batchBeats[0]?.beat_id || 'S??'}）的 video_prompt 0-2秒 必须引用 [@图像_分镜${prevBatchLastBeatId}] 作为首帧衔接锚点，从该画面自然过渡，禁止跳切。\n\n`
            : '';

        for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
            if (signal?.aborted) {
                throw new Error("Aborted");
            }
            try {
                if (onProgress) {
                    onProgress(`Asset Production: Batch ${i + 1}/${batchCount}${attempt > 1 ? ` [Retry ${attempt}/${MAX_BATCH_RETRIES}]` : ''}...`);
                }

                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: MODELS.TEXT_FAST,
                    contents: { parts: [{ text: `${continuityHint}Translate these beats (Batch ${i + 1}/${batchCount}) into Scenes:\n${beatsStr}` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json",
                        responseSchema: agent3Schema,
                        signal
                    }
                }), 3, 2000, undefined, signal);

                const parsed = safeJsonParse<any>(response.text, { scenes: [] });

                let batchScenes: Scene[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (parsed[0].scenes) {
                        batchScenes = parsed[0].scenes;
                    } else if (parsed.some((item: any) => item.id !== undefined && (item.np_prompt !== undefined || item.prompt_options !== undefined))) {
                        batchScenes = parsed.filter((item: any) => item.id !== undefined && (item.np_prompt !== undefined || item.prompt_options !== undefined));
                    } else {
                        batchScenes = parsed;
                    }
                } else {
                    batchScenes = parsed.scenes || [];
                }

                if (batchScenes.length === 0) {
                    throw new Error(`Batch returned 0 scenes (expected ${batchBeats.length})`);
                }

                const validatedScenes = batchScenes.map(scene => {
                    // Fallback injection for backwards compatibility
                    if (scene.prompt_options && scene.prompt_options.length > 0) {
                        scene.np_prompt = scene.prompt_options[0].np_prompt;
                        scene.video_prompt = scene.prompt_options[0].video_prompt;
                        scene.camera = scene.prompt_options[0].camera;
                        scene.lens = scene.prompt_options[0].lens;
                        scene.focal_length = scene.prompt_options[0].focal_length;
                        scene.aperture = scene.prompt_options[0].aperture;
                    }

                    let np = scene.np_prompt || "";
                    if (!np || np === "..." || np.trim().length < 5) {
                        np = (scene.video_prompt || "").replace(/\s*\d+-\d+s:\s*/g, ' ').trim();
                    }

                    const allPromptText = `${scene.video_prompt || ''} ${np}`;
                    const tagMatches = [...allPromptText.matchAll(ASSET_TAG_REGEX)];
                    const matchedIds = new Set<string>();

                    for (const m of tagMatches) {
                        const tagName = m[1] || m[3];
                        const anchoredId = m[2] || m[4];
                        if (isStoryboardTag(tagName)) continue;

                        const resolved = resolveTagToAsset(
                            { name: tagName, id: anchoredId },
                            assets
                        );
                        if (resolved) matchedIds.add(resolved.id);
                    }

                    const validAssetIdSet = new Set(assets.map(a => a.id));
                    for (const id of (scene.assetIds || [])) {
                        if (validAssetIdSet.has(id)) {
                            matchedIds.add(id);
                        }
                    }

                    const videoPrompt = injectTagIds(scene.video_prompt || '', assets);
                    const npPrompt = injectTagIds(np, assets);
                    
                    // Also inject into the prompt_options array so frontend options have valid tags
                    if (scene.prompt_options) {
                        for (const opt of scene.prompt_options) {
                            opt.video_prompt = injectTagIds(opt.video_prompt || '', assets);
                            
                            let optNp = opt.np_prompt || "";
                            if (!optNp || optNp === "..." || optNp.trim().length < 5) {
                                optNp = (opt.video_prompt || "").replace(/\s*\d+-\d+s:\s*/g, ' ').trim();
                            }
                            opt.np_prompt = injectTagIds(optNp, assets);
                        }
                    }

                    return { ...scene, np_prompt: npPrompt, video_prompt: videoPrompt, assetIds: [...matchedIds] };
                });

                let finalizedBatch: Scene[] = validatedScenes;

                if (finalizedBatch.length > 0 && assets.length > 0) {
                    try {
                        if (onProgress) onProgress('Asset Matching: Semantic review...');
                        finalizedBatch = await semanticAssetMatch(finalizedBatch, assets, signal);
                    } catch (e: any) {
                        if (e.name === 'AbortError' || e.message === 'Aborted' || signal?.aborted) {
                            throw e;
                        }
                        console.warn('[Agent3] Semantic asset match failed chunk:', e?.message || e);
                    }

                    finalizedBatch = finalizedBatch.map(scene => {
                        const activeIds = scene.assetIds || [];
                        if (activeIds.length === 0) return scene;

                        const activeAssets = activeIds.map(id => assets.find(a => a.id === id)).filter(Boolean) as Asset[];
                        const sortedAssets = [...activeAssets].sort((a, b) => b.name.length - a.name.length);

                        const textuallyInjectTagsLocal = (text: string) => textuallyInjectTags(text, sortedAssets);

                        const replaceInPromptOptions = (options: any[]) => {
                            if (!options) return options;
                            return options.map(opt => ({
                                ...opt,
                                video_prompt: textuallyInjectTagsLocal(opt.video_prompt),
                                np_prompt: textuallyInjectTagsLocal(opt.np_prompt),
                            }));
                        };

                        const updatedOptions = replaceInPromptOptions(scene.prompt_options || []);
                        return {
                            ...scene,
                            video_prompt: textuallyInjectTagsLocal(scene.video_prompt || ''),
                            np_prompt: textuallyInjectTagsLocal(scene.np_prompt || ''),
                            prompt_options: updatedOptions.length > 0 ? updatedOptions : undefined,
                            visual_desc: textuallyInjectTagsLocal(scene.visual_desc || '')
                        };
                    });

                    try {
                        if (onProgress) onProgress('Asset Matching: Smart Semantic Tag Injection...');
                        finalizedBatch = await llmTagInjector(finalizedBatch, assets, signal);
                    } catch (e: any) {
                        if (e.name === 'AbortError' || e.message === 'Aborted' || signal?.aborted) {
                            throw e;
                        }
                        console.warn('[Agent4] LLM Tag Injector failed chunk:', e?.message || e);
                    }
                }

                allScenes.push(...finalizedBatch);

                if (finalizedBatch.length > 0) {
                    const lastScene = finalizedBatch[finalizedBatch.length - 1];
                    prevBatchEndContext = [
                        lastScene.visual_desc || '',
                        `video_prompt 尾段: ${(lastScene.video_prompt || '').slice(-200)}`,
                        lastScene.audio_sfx ? `音效: ${lastScene.audio_sfx}` : ''
                    ].filter(Boolean).join(' | ');
                }

                batchSuccess = true;
                
                // 【推流核心】：单个镜头生成且打完标签后，立刻作为 Stream Chunk yield 给上游
                yield finalizedBatch;
                break;
            } catch (batchError: any) {
                if (batchError.name === 'AbortError' || batchError.message === 'Aborted' || signal?.aborted) {
                    throw batchError;
                }
                console.error(`[Agent3][Batch ${i + 1}/${batchCount}][Retry ${attempt}/${MAX_BATCH_RETRIES}] failed (beats ${start}-${end}):`, batchError?.message || batchError);
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
            const msg = `[Agent3][Batch ${i + 1}/${batchCount}] beats ${start}-${end} failed after ${MAX_BATCH_RETRIES} retries.`;
            console.error(msg);
            if (onProgress) {
                onProgress(`⚠ Batch ${i + 1}/${batchCount} failed after ${MAX_BATCH_RETRIES} retries. Skipping batch and continuing...`);
            }
            
            // Yield error placeholders for this batch
            const errorScenes: Scene[] = batchBeats.map((beat: any) => ({
                id: beat.beat_id || `err_${Date.now()}_${Math.random()}`,
                narration: beat.visual_action || "未生成画面",
                visual_desc: `[${beat.shot_name || beat.shot_id || 'Unknown'}] ${beat.visual_action || "未生成画面"}`,
                video_prompt: "",
                np_prompt: "",
                status: "failed",
                error: "AI 模型响应超时或格式错误"
            }));
            
            yield errorScenes;
            continue;
        }
    }
};

/**
 * 兼容性同步包装器（供直接调用老接口的代码使用）
 * 内部消费完整的 Stream 并返回 `Promise<Scene[]>`
 */
export const runAgent3_AssetProduction = async (
    beatSheet: MasterBeatSheet,
    language: string,
    assets: Asset[],
    stylePrefix: string,
    aspectRatio: string = '16:9',
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
): Promise<Scene[]> => {
    let allScenes: Scene[] = [];
    for await (const chunk of runAgent3_AssetProductionStream(beatSheet, language, assets, stylePrefix, aspectRatio, onProgress, signal)) {
        allScenes.push(...chunk);
    }
    return allScenes;
};

/**
 * Agent 4: Smart LLM Tag Injector
 * 并发处理所有场景的提示词选项，利用上下文真正理解名字含义并强制注入标签语法。
 */
export async function llmTagInjector(scenes: Scene[], assets: Asset[], signal?: AbortSignal): Promise<Scene[]> {
    return Promise.all(scenes.map(async scene => {
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        const activeIds = scene.assetIds || [];
        if (activeIds.length === 0 || !scene.prompt_options || scene.prompt_options.length === 0) return scene;

        const activeAssets = activeIds.map(id => assets.find(a => a.id === id)).filter(Boolean) as Asset[];
        if (activeAssets.length === 0) return scene;

        const targetCatalog = activeAssets.map(a => `- ${a.name} (请将其替换为 [@图像_${a.name}#${a.id}])`).join('\n');

        const inputPayload = JSON.stringify(scene.prompt_options.map(opt => ({
            option_id: opt.option_id,
            video_prompt: opt.video_prompt,
            np_prompt: opt.np_prompt
        })), null, 2);

        const schema = {
            type: Type.OBJECT,
            properties: {
                options: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            option_id: { type: Type.STRING },
                            video_prompt: { type: Type.STRING },
                            np_prompt: { type: Type.STRING }
                        },
                        required: ["option_id", "video_prompt", "np_prompt"]
                    }
                }
            },
            required: ["options"]
        };

        try {
            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: {
                    parts: [{
                        text: `您是一个专业的文本格式修饰器。请将下方 JSON 数据里的 video_prompt 和 np_prompt 字段进行语义标签包裹。
                        
【目标资产大名单与格式要求】
${targetCatalog}

【最高权限规则】
1. 仔细阅读原文本意，找出所有真正指代上述目标资产的词（无论是全名，还是“他/她”、“那个少年”等明显的代词）。
2. 将这些词汇直接替换为大名单中要求的 [@图像_名字#ID] 格式。例如如果文案写的是“他转过身”，替换为“[@图像_名字#ID] 转过身”。
3. 绝对禁止修改、总结、或增加任何与标签无关的内容！必须保持原始机位、打光、动作指令完全一字不差！
4. 绝不要误杀非指代词汇（例如人物叫“白”，绝不允许修改“大白天”、“白云”里的白）。
5. 【防套娃保险】：如果文本中已经包含 [@图像_...] 这样的格式，绝对不要对它进行重复替换！(例如不可将 [@图像_Z#id] 变成 [@图像_[@图像_Z... )

输入待处理的架构 JSON 数组：
${inputPayload}`
                    }]
                },
                config: {
                    systemInstruction: "你是一个极其精准的语义格式化机器人。仅在确认语境指代目标出场人物/物品时包裹指定的格式化标签。必须返回一个 JSON 对象，其包含一个 `options` 字段，且 `options` 是一个数组，映射所有修改后的原文项。",
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    signal
                }
            }), 2, 2000, undefined, signal);

            const parsed = safeJsonParse<{options: any[]}>(response.text, {options: []});
            if (parsed && Array.isArray(parsed.options) && parsed.options.length === scene.prompt_options.length) {
                const newOptions = [...scene.prompt_options];
                for (let i = 0; i < parsed.options.length; i++) {
                    const opt = parsed.options[i];
                    const existingIdx = newOptions.findIndex(o => o.option_id === opt.option_id);
                    if (existingIdx >= 0) {
                        if (opt.video_prompt && opt.video_prompt.length > 5) {
                            newOptions[existingIdx].video_prompt = opt.video_prompt;
                        }
                        if (opt.np_prompt && opt.np_prompt.length > 5) {
                            newOptions[existingIdx].np_prompt = opt.np_prompt;
                        }
                    }
                }
                return { ...scene, prompt_options: newOptions };
            }
        } catch(e: any) {
            if (e.name === 'AbortError' || e.message === 'Aborted' || signal?.aborted) {
                throw e;
            }
            console.error(`[Agent 4] Smart LLM Tag Injector failed for scene ${scene.id}:`, e);
        }
        return scene;
    }));
}

/**
 * LLM 语义资产匹配器 — 二次审查
 * 将所有场景的 visual_desc 和完整资产清单发给 LLM，
 * 让它基于语义理解返回每个场景应该关联的 asset_id 列表。
 */
async function semanticAssetMatch(scenes: Scene[], assets: Asset[], signal?: AbortSignal): Promise<Scene[]> {
    if (signal?.aborted) {
        throw new Error("Aborted");
    }
    const assetCatalog = assets.map(a => `${a.id} | ${a.name} | ${a.type || 'unknown'}`).join('\n');
    const sceneList = scenes.map(s => `${s.id} | ${s.visual_desc || s.narration || ''}`).join('\n');

    const matchSchema = {
        type: Type.OBJECT,
        properties: {
            matches: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        scene_id: { type: Type.STRING },
                        asset_ids: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["scene_id", "asset_ids"]
                }
            }
        },
        required: ["matches"]
    };

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.TEXT_FAST,
        contents: {
            parts: [{
                text: `请为以下每个场景匹配所有相关的资产ID。

## 资产清单 (id | name | type)
${assetCatalog}

## 场景列表 (scene_id | visual_desc)
${sceneList}

规则：
1. 基于语义理解匹配。例如场景提到"车厢内"，应匹配到"中巴车内部"资产。场景提到某角色，应匹配该角色的资产ID。
2. 每个场景至少匹配1个location类型资产（如果有的话）和所有出现的character资产。
3. 只返回资产清单中存在的ID，禁止编造。` }]
        },
        config: {
            systemInstruction: '你是资产匹配专家。根据场景描述内容，精准匹配所有语义相关的资产。输出JSON格式。',
            responseMimeType: "application/json",
            responseSchema: matchSchema,
            signal
        }
    }), 3, 2000, undefined, signal);

    const parsed = safeJsonParse<any>(response.text, { matches: [] });
    const matchMap = new Map<string, string[]>();

    const validIds = new Set(assets.map(a => a.id));
    for (const m of (parsed.matches || [])) {
        if (m.scene_id && Array.isArray(m.asset_ids)) {
            // 只保留有效的资产 ID
            const validMatches = m.asset_ids.filter((id: string) => validIds.has(id));
            matchMap.set(m.scene_id, validMatches);
        }
    }

    // 合并：将 LLM 语义匹配结果与已有的 regex 匹配结果取并集
    return scenes.map(scene => {
        const llmIds = matchMap.get(scene.id) || [];
        const existingIds = new Set(scene.assetIds || []);
        for (const id of llmIds) {
            existingIds.add(id);
        }
        return { ...scene, assetIds: [...existingIds] };
    });
}
