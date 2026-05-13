import { Asset, GlobalStyle, GenerateContentResponse } from "../../../shared/types";
import { retryWithBackoff, safeJsonParse, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { extractAssetTags, resolveTagToAsset, stripAssetTags, isStoryboardTag } from "../../../shared/asset-tags";
import sharp from 'sharp';
import fetch from 'node-fetch';

// --- HELPER: Extract Image (Base64 or URL) from Response ---
export const extractImageFromResponse = (response: GenerateContentResponse): string => {
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned.");

    // 1. Inline Base64
    const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
    if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
    }

    // 2. Text containing URL
    const textPart = candidate.content?.parts?.find((p: any) => p.text);
    if (textPart?.text) {
        let text = textPart.text.trim();

        const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (mdMatch) return mdMatch[1];

        if (text.startsWith("! ")) text = text.substring(2).trim();

        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) return urlMatch[1];

        throw new Error(`Model Refusal: ${text}`);
    }

    throw new Error("No image data returned.");
};

/**
 * Backend version: uses sharp for image processing instead of Canvas/Image browser APIs.
 */
export async function ensurePngDataUrl(url: string, maxDimension: number = 1024): Promise<string> {
    try {
        if (!url) return url;

        let buffer: Buffer;

        if (url.startsWith("data:")) {
            const match = url.match(/^data:[^;]+;base64,(.+)$/);
            if (!match) return url;
            buffer = Buffer.from(match[1], 'base64');
        } else if (url.startsWith("http")) {
            const res = await fetch(url);
            const arrayBuf = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
        } else {
            return url;
        }

        let pipeline = sharp(buffer);
        const metadata = await pipeline.metadata();

        if (!metadata.width || !metadata.height) return url;

        // Downscale if exceeding maxDimension
        if (maxDimension > 0 && Math.max(metadata.width, metadata.height) > maxDimension) {
            pipeline = pipeline.resize({
                width: metadata.width > metadata.height ? maxDimension : undefined,
                height: metadata.height >= metadata.width ? maxDimension : undefined,
                fit: 'inside'
            });
        }

        const pngBuffer = await pipeline.png().toBuffer();
        return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch {
        return url;
    }
}

export const computeStylePrefix = (style: GlobalStyle): string => {
    if (style.visualDnaLocked === false) {
        return "";
    }
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;
    const textureStyle = style.texture?.custom || (style.texture?.selected !== 'None' ? style.texture?.selected : 'Realistic') || 'Realistic';
    const visualDna = style.visualTags || "";

    const isStandardPrefix = visualDna.trim().startsWith("[") && visualDna.includes("]");

    let stylePrefix = "";

    if (useOriginalCharacters) {
        if (!workStyle || !workStyle.trim()) {
            stylePrefix = "Cinematic";
        } else {
            const normalizedWork = workStyle.trim();
            const hasChinese = /[\u4e00-\u9fa5]/.test(normalizedWork);
            const suffix = hasChinese ? "美术风格" : " Art Style";
            if (!normalizedWork.endsWith(suffix.trim())) {
                stylePrefix = `${normalizedWork}${suffix}`;
            } else {
                stylePrefix = normalizedWork;
            }
        }
    } else if (isStandardPrefix) {
        stylePrefix = visualDna;
    } else {
        const medium = workStyle || "Cinematic";
        const era = "Modern";
        const color = "Cinematic Color";
        const lighting = "Volumetric Lighting";
        const texture = textureStyle || "High Quality";
        stylePrefix = `[${medium}][${era}][${color}][${lighting}][${texture}], ((Art Style: ${workStyle})), ((Texture: ${textureStyle}))`;
    }
    return stylePrefix;
};

/**
 * Pure function: build the image-generation prompt for an asset based on its type and style.
 * No AI call — just template logic. Can be called independently to pre-populate asset.prompt.
 */
export const buildAssetPrompt = (asset: Asset, style: GlobalStyle): string => {
    // Normalize legacy types: prop→item, creature→character, vehicle/effect→item
    const rawType = (asset.type || 'location') as string;
    const typeMap: Record<string, string> = { prop: 'item', creature: 'character', vehicle: 'item', effect: 'item' };
    const assetType = typeMap[rawType] || rawType;

    // Auto-detect language from description content
    const isChinese = /[\u4e00-\u9fa5]/.test(asset.description || '');

    if (assetType === 'character') {
        if (isChinese) {
            return `(最高画质, 大师杰作), 角色设定图, 纯白背景, 摄影棚灯光.
            画面左侧为${asset.name}面部极致特写，高清细节，正面直视镜头。画面右侧为${asset.name}全身三视图，正面、侧面、背面站立姿态，整齐排列。
            ${asset.description}。
            绝对不允许出现任何文字、标注、说明。`;
        }

        return `(Best quality, masterpiece), character design sheet, pure white background, studio lighting.
            Left side shows extreme close-up portrait of ${asset.name}'s face, high definition detailed eyes, looking directly at camera. Right side shows ${asset.name} full body three-view turnaround, front side back standing poses neatly arranged.
            ${asset.description}. 
            Absolutely no text, no labels, no annotations.`;
    } else if (assetType === 'item') {
        if (isChinese) {
            return `(最高画质, 大师杰作, 极致细节, 清晰线条), 完美的物品概念设定版, 纯白背景, 静态展示, 无特效, 无动作.
            包含物品正面、侧面、背面及局部特写，排版整洁有序。所有视图展示的是同一个物品，形状、比例、配色、材质、细节必须100%完全统一，无任何特征偏差，如同对同一个实物从不同角度拍摄的照片。
            物品核心设定：${asset.description}。
            必须完整保留物品本体原生的功能性文字与标识（铭牌、编号、刻度、铭文等），所有视图中对应文字位置、内容完全一致，清晰可读。
            绝对禁止生成额外的标注文字、水印、签名。`;
        }

        return `(Best quality, masterpiece, extreme detail, clean lines), perfect object concept design sheet, pure white background, static display, no effects, no action.
            Includes front, side, back views and close-up details, neatly arranged layout. All views show the same single object, identical shape, proportions, color, material and detail across every view, as if photographed from different angles, zero deviation.
            Core design: ${asset.description}.
            Preserve all functional text inherent to the object itself such as nameplates, serial numbers, scale markings, inscriptions. These must be consistent and legible across all views.
            Absolutely no annotation text, no watermarks, no signatures.`;
    } else {
        if (isChinese) {
            return `(最高画质, 大师杰作), 建立镜头, 广角, 环境概念艺术, 电影构图, 纯场景, 无角色, 无人物.
            ${asset.name}：${asset.description}。
            绝对不允许出现任何文字、标注、说明。`;
        }

        return `(Best quality, masterpiece), establishing shot, wide angle, environment concept art, cinematic composition, scenery only, no characters, no people.
            ${asset.name}: ${asset.description}. 
            Absolutely no text, no labels, no annotations.`;
    }
};

export const generateAssetImage = async (
    asset: Asset,
    style: GlobalStyle,
    existingAssets: Asset[] = [],
    overridePrompt?: string,
    referenceImage?: string
): Promise<{ imageUrl: string, prompt: string }> => {
    // Use override > existing asset.prompt > build new
    const prompt = overridePrompt || asset.prompt || buildAssetPrompt(asset, style);

    const stylePrefix = computeStylePrefix(style);
    let finalPrompt = prompt;
    if (stylePrefix && !finalPrompt.includes(stylePrefix.trim())) {
        finalPrompt = `${stylePrefix}, ${finalPrompt}`;
    }

    const ar = style.aspectRatio || '16:9';

    const callModel = async (p: string) => {
        console.log(`[Asset Gen] Prompt: ${p}`);
        const parts: any[] = [{ text: p }];

        // Add reference image from existing assets if available
        let refImg = referenceImage;
        if (!refImg && asset && (asset.refImageUrl || asset.refImageAssetId)) {
            refImg = asset.refImageUrl || asset.refImageAssetId;
        }

        if (refImg) {
            try {
                // If it's a URL/AssetID instead of Base64, we need to load it first
                if (!refImg.startsWith('data:')) {
                    refImg = await ensurePngDataUrl(refImg);
                }

                const matches = refImg.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                }
            } catch (e) {
                console.warn("Failed to parse reference image", e);
            }
        }

        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.IMAGE_GEN,
            contents: { parts },
            config: { imageConfig: { aspectRatio: ar, isAsset: true } }
        }), 1, 2000);

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Safety Block: No candidates returned.");
        }

        const raw = extractImageFromResponse(response);
        return await ensurePngDataUrl(raw);
    };

    try {
        const imageUrl = await callModel(finalPrompt);
        return { imageUrl, prompt };
    } catch (e: any) {
        console.warn("Asset Gen Attempt 1 Failed:", e.message);

        try {
            let simplePrompt = `(Best quality), ${asset.type === 'character' ? 'Character Sheet, Three Views, white background' : asset.type === 'item' ? 'Item views, white background' : 'Environment concept art, no humans, empty scenery'}, Subject: ${asset.description}`;
            if (stylePrefix && !simplePrompt.includes(stylePrefix.trim())) {
                simplePrompt = `${stylePrefix}, ${simplePrompt}`;
            }
            const imageUrl = await callModel(simplePrompt);
            return { imageUrl, prompt: simplePrompt };
        } catch (e2) {
            throw e2;
        }
    }
};

export const generateSceneImage = async (
    scene: any,
    globalStyle?: GlobalStyle,
    assets: Asset[] = [],
    optionId?: string
): Promise<any> => {
    // If optionId is provided, find the specific option, otherwise fallback to main scene
    const option = optionId && scene.prompt_options ? scene.prompt_options.find((o: any) => o.option_id === optionId) : null;
    const prompt = option ? (option.np_prompt || option.video_prompt) : (scene.np_prompt || scene.visual_desc || '');

    if (!prompt || !prompt.trim()) {
        throw new Error('No prompt available for scene image generation. Please generate prompts first.');
    }
    const ar = globalStyle?.aspectRatio || '16:9';

    let basePrompt = prompt.substring(0, 1500);
    const stylePrefix = globalStyle ? computeStylePrefix(globalStyle) : "";
    let finalPrompt = basePrompt;
    if (stylePrefix && !basePrompt.includes(stylePrefix.trim())) {
        finalPrompt = `${stylePrefix}, ${basePrompt}`;
    }

    // 1. Identify Assets - Frontend SSOT provides exactly what is needed!
    const usedAssets: Asset[] = assets;

    // 2. Build Multi-modal Request Parts
    const parts: any[] = [];
    let instructions = "";

    let charCount = 0;
    let locCount = 0;
    let itemCount = 0;
    let refFrameCount = 0;
    const nameToAliasMap = new Map<string, string>();

    // 2.2 Next push the asset reference images
    usedAssets.forEach((asset) => {
        if (asset.refImageUrl) {
            let alias = "";
            if (isStoryboardTag(asset.name)) {
                alias = `[Reference ${String.fromCharCode(65 + refFrameCount++)}]`;
            } else if (asset.type === 'character') {
                alias = `[Character ${String.fromCharCode(65 + charCount++)}]`;
            } else if (asset.type === 'item') {
                alias = `[Object ${String.fromCharCode(65 + itemCount++)}]`;
            } else {
                alias = `[Location ${String.fromCharCode(65 + locCount++)}]`;
            }
            nameToAliasMap.set(asset.name, alias);

            const cleanBase64 = asset.refImageUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: cleanBase64
                }
            });
            instructions += ` Reference Image ${parts.length} is ${alias}.`;
        }
    });

    // 3. Construct Final Prompt
    // Dynamically replace asset tags with their assigned aliases to avoid semantic leakage
    const ASSET_TAG_REGEX_LOCAL = /\[@图像_([^#\]]+)(?:#([a-zA-Z0-9_]+))?\]|@图像_([^\s，。,.;；：:！!？?、）)｝}\]\[（(｛{@#]+)(?:#([a-zA-Z0-9_]+))?/g;
    let fullText = finalPrompt.replace(ASSET_TAG_REGEX_LOCAL, (match, p1, p2, p3, p4) => {
        const name = p1 || p3;
        if (name && nameToAliasMap.has(name)) {
            return nameToAliasMap.get(name)!;
        }
        return name || '';
    }).replace(/\s{2,}/g, ' ').trim();

    if (instructions) {
        fullText = ` ${instructions} ${fullText}. `;
    }

    parts.push({ text: fullText });

    console.log(`[Scene Gen] Final Prompt: ${fullText}`);

    const fs = require('fs');
    const logFile = 'C:\\Users\\Administrator\\Desktop\\duanju\\duanju0302\\server-debug.log';
    const log = (msg: string) => {
        const timeStr = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
        const line = `[${timeStr}] ${msg}\n`;
        console.log(line.trim());
        try { fs.appendFileSync(logFile, line); } catch (e) { }
    };

    log(`[Scene Gen] Calling generateContent...`);
    const startTime = Date.now();

    log(`[Scene Gen] Calling generateContent with retryWithBackoff...`);
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.IMAGE_GEN,
        contents: { parts: parts },
        config: { imageConfig: { aspectRatio: ar } }
    }), 1, 2000);

    const elapsed = Date.now() - startTime;
    log(`[Scene Gen] generateContent finished in ${elapsed}ms.`);

    if (!response.candidates || response.candidates.length === 0) {
        log(`[Scene Gen] ERROR: No candidates returned.`);
        throw new Error("Generation blocked by safety filters or no candidates returned.");
    }

    log(`[Scene Gen] Extracting image from response...`);
    const raw = extractImageFromResponse(response);

    log(`[Scene Gen] Image extracted, length: ${raw.length}. Bypassing sharp processing for Data URLs...`);
    let imageUrl = raw;
    if (raw.startsWith('http')) {
        log(`[Scene Gen] Image is HTTP URL, ensuring PNG...`);
        imageUrl = await ensurePngDataUrl(raw, 0); // 0 = no resize
    }

    log(`[Scene Gen] Final image ready, length: ${imageUrl.length}. Returning to frontend...`);
    return { imageUrl };
};

/**
 * Reverse engineers smart prompt descriptions for multiple angles based on a base description and optional reference image.
 */
export const reverseEngineerAngles = async (
    description: string,
    targetAngles: string[],
    imageBase64?: string,
    language: string = "Chinese"
): Promise<{ angle: string; description: string }[]> => {
    let parts: any[] = [];

    let useVision = false;
    if (imageBase64) {
        const match = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+);base64,(.+)$/);
        if (match && match.length === 3) {
            useVision = true;
            parts.push({
                inlineData: { mimeType: match[1], data: match[2] }
            });
        }
    }

    let promptText = `你是一个电影摄影指导+3D空间建模专家+生图提示词工程师。
你的任务是在【完全复用同一个空间】前提下仅改变“摄像机位置与朝向”生成不同方位的提示词。
【输入场景】${description}
目标方位:${JSON.stringify(targetAngles)}
${useVision ? `【参考图约束(最高优先级)】严格遵守参考图空间结构、主体资产及材质外观。禁止新增/删除物体或改变布局。` : `【无参考图时】先构建稳定三维场景布局并在所有机位保持一致。`}
【核心规则】
1.场景锁定(最重要):使用"the exact same environment","identical layout","same objects and positions","no changes to scene content"强制锁定。
2.物理摄像机强制转移(垂直视角/打破原图角度):强制【摄影机与观察面完全垂直(Orthogonal/Flat elevation view)】:
-正面:"Camera exactly perpendicular to the front","Dead-on flat elevation view","Zero perspective distortion"
-背面:"Camera exactly perpendicular to the back","180-degree reverse dead-on view","Flat architectural elevation"
-左侧:"Camera exactly perpendicular to the left wall","90-degree side flat elevation view"
-右侧:"Camera exactly perpendicular to the right wall","90-degree side flat elevation view"
-顶部:"Camera exactly perpendicular looking straight up","Flat ceiling plan view, zero perspective"
-底部:"Camera exactly perpendicular looking straight down","Flat floor plan view, absolute top-down"
3.空间重投影:根据方位重新计算视野内容,如背面绝不能和正面看到的一样。
4.输出结构:使用${language}，逗号分隔:"description":"[一致性锁定语],[物理摄像机设定与朝向],[从该角度看到的空间结构与物体变化]"。
禁止写故事/氛围/情绪/发散/新增元素。
返回JSON:{"results":[{"angle":"","description":""}]}
`;

    parts.push({ text: promptText });

    const { Type } = await import('../helpers');

    const schema = {
        type: Type.OBJECT,
        properties: {
            results: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        angle: { type: Type.STRING },
                        description: { type: Type.STRING }
                    },
                    required: ["angle", "description"]
                }
            }
        },
        required: ["results"]
    };

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.TEXT_FAST,
        contents: { parts },
        config: {
            systemInstruction: "你是一个专业的电影摄影指导与提示词工程师。输出严格符合要求的 JSON 对象。",
            responseMimeType: "application/json",
            responseSchema: schema
        }
    }), 2, 2000);

    const parsed = safeJsonParse<{ results: { angle: string; description: string }[] }>(response.text, { results: [] });
    return parsed.results || [];
};

