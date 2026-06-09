import { GenerateContentResponse, VideosOperation } from "../../../shared/types";
import { IAIProvider, GenerateContentArgs, GenerateVideosArgs, GetVideosOperationArgs, AIProviderConfig } from "./interfaces";
import {
    isHttpUrl,
    normalizeImageToDataUrl,
    parseDataUrl,
    base64ByteSize,
    compressDataUrlToJpegBase64,
    findFirstHttpUrlDeep
} from "./t8star-utils";
import nodeFetch from 'node-fetch';
import { getProxyAgent } from "../helpers";
import { ProviderConfig } from "../../../shared/types";

const fetch = (url: any, options: any = {}) => {
    const agent = getProxyAgent(url);
    if (agent) {
        options.agent = agent;
    }
    return nodeFetch(url, options);
};

function normalizeSchemaTypes(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    const newSchema = { ...schema };
    if (typeof newSchema.type === 'string') {
        newSchema.type = newSchema.type.toLowerCase();
    }
    if (newSchema.properties && typeof newSchema.properties === 'object') {
        const newProps: any = {};
        for (const [key, val] of Object.entries(newSchema.properties)) {
            newProps[key] = normalizeSchemaTypes(val);
        }
        newSchema.properties = newProps;
    }
    if (newSchema.items && typeof newSchema.items === 'object') {
        newSchema.items = normalizeSchemaTypes(newSchema.items);
    }
    return newSchema;
}

export class OpenAICompatibleProvider implements IAIProvider {
    private providerId: string;
    private config: any;
    private textBaseUrl: string;
    private mediaBaseUrl: string;

    private textApiKey: string;
    private imageApiKey: string;
    private videoApiKey: string;
    private audioApiKey: string;
    private nanobananaApiKey: string;
    private modelApiKeys: Record<string, string> = {};
    private enabled: boolean;

    constructor(providerId: string, config?: any) {
        this.providerId = providerId;
        this.config = config || {};
        this.textBaseUrl = this.config.baseUrl || "https://ai.t8star.org";
        this.mediaBaseUrl = this.config.mediaBaseUrl || this.config.baseUrl || "https://ai.t8star.org";

        const globalKey = this.config.apiKey || "";
        this.textApiKey = globalKey;
        this.imageApiKey = this.config.mediaApiKey || globalKey;
        this.videoApiKey = this.config.videoApiKey || globalKey;
        this.audioApiKey = this.config.audioApiKey || globalKey;
        this.nanobananaApiKey = this.config.nanobananaApiKey || globalKey;
        this.modelApiKeys = this.config.modelApiKeys || {};
        this.enabled = this.config.enabled !== false;

        console.log(`[OpenAICompatible - ${this.providerId}] Initialized with baseUrl: ${this.textBaseUrl}, videoApiKey prefix:`, this.videoApiKey ? `${this.videoApiKey.substring(0, 8)}...` : "NONE");
    }

    private getApiKey(model: string, defaultKey: string): string {
        if (this.modelApiKeys && this.modelApiKeys[model]) {
            return this.modelApiKeys[model];
        }
        return defaultKey;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    private resolveUrl(baseUrl: string, path: string): string {
        const cleanBase = baseUrl.trim().replace(/\/+$/, "");
        
        // If path starts with /v1/ or /v1?
        if (path.startsWith("/v1/") || path === "/v1" || path.startsWith("/v1?")) {
            if (cleanBase.endsWith("/v1")) {
                return `${cleanBase}${path.substring(3)}`;
            } else {
                return `${cleanBase}${path}`;
            }
        }
        
        // If path starts with /v2/ or /seedance/
        if (path.startsWith("/v2/") || path.startsWith("/seedance/")) {
            if (cleanBase.endsWith("/v1")) {
                const baseWithoutV1 = cleanBase.substring(0, cleanBase.length - 3).replace(/\/+$/, "");
                return `${baseWithoutV1}${path}`;
            } else {
                return `${cleanBase}${path}`;
            }
        }
        
        return `${cleanBase}${path}`;
    }

    private isCompatibleModel(model?: string) {
        if (!model) return false;
        if (model.includes("image") || model.includes("imagen") || model === "nano-banana-pro") return false;
        return (
            model.includes("gemini") ||
            model.includes("nano-banana") ||
            model.includes("gpt-") ||
            model === "gemini-3.1-flash-lite-preview-thinking-high"
        );
    }

    private extractDataUrlFromText(text: string): { mimeType: string; b64: string } | null {
        if (!text) return null;
        const m = text.match(
            /data:((?:image|audio)\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/
        );
        if (!m) return null;
        return { mimeType: m[1], b64: m[2] };
    }

    private extractInlineB64(messageContent: any): { mimeType: string; b64: string } | null {
        if (typeof messageContent === "string") {
            const hit = this.extractDataUrlFromText(messageContent);
            if (hit) return hit;

            try {
                const obj = JSON.parse(messageContent);
                const b64 =
                    obj?.b64_json ||
                    obj?.data?.[0]?.b64_json ||
                    obj?.image?.b64 ||
                    obj?.image_base64 ||
                    obj?.audio?.b64 ||
                    obj?.audio_base64 ||
                    obj?.base64 ||
                    obj?.image?.base64;
                const mimeType =
                    obj?.mimeType || obj?.mime_type || obj?.audio?.mimeType || "image/png";
                if (typeof b64 === "string" && b64.length > 0) return { mimeType, b64 };
            } catch { }

            return null;
        }

        if (Array.isArray(messageContent)) {
            for (const part of messageContent) {
                if (!part || typeof part !== "object") continue;

                if (part.type === "image_url" && typeof part.image_url?.url === "string") {
                    const hit = this.extractDataUrlFromText(part.image_url.url);
                    if (hit) return hit;
                }
                if (part.type === "audio_url" && typeof part.audio_url?.url === "string") {
                    const hit = this.extractDataUrlFromText(part.audio_url.url);
                    if (hit) return hit;
                }
                if (part.type === "text" && typeof part.text === "string") {
                    const hit = this.extractDataUrlFromText(part.text);
                    if (hit) return hit;
                }

                const b64 =
                    part?.b64_json || part?.image_base64 || part?.audio_base64 || part?.base64 || part?.data;
                if (typeof b64 === "string" && b64.length > 100) {
                    const mimeType = part?.mimeType || part?.mime_type || "image/png";
                    return { mimeType, b64 };
                }
            }
        }

        return null;
    }

    private async postJson(baseUrl: string, path: string, body: any, apiKey: string, signal?: AbortSignal) {
        const fs = require('fs');
        const pathLib = require('path');
        const baseDir = process.env.EXTERNAL_ENV_PATH || pathLib.join(__dirname, '../../../../../');
        const logFile = pathLib.join(baseDir, 'server-debug.log');
        const log = (msg: string) => {
            const timeStr = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
            const line = `[${timeStr}] ${msg}\n`;
            console.log(line.trim());
            try { fs.appendFileSync(logFile, line); } catch(e){}
        };

        const url = this.resolveUrl(baseUrl, path);
        log(`[${this.providerId} API] POST ${url}...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            log(`[${this.providerId} API] ERROR: Hard timeout of 300s reached! Aborting connection.`);
            controller.abort();
        }, 300000); // 300s hard timeout

        const abortHandler = () => {
            log(`[${this.providerId} API] External abort requested. Aborting connection.`);
            controller.abort();
        };

        if (signal) {
            if (signal.aborted) {
                controller.abort();
            } else {
                signal.addEventListener('abort', abortHandler);
            }
        }

        try {
            const startTime = Date.now();
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal as any,
            });

            const timeToHeaders = Date.now() - startTime;
            log(`[${this.providerId} API] POST ${url} returned ${res.status} in ${timeToHeaders}ms`);

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`HTTP Error: ${res.status} ${text}`);
            }

            const buffer = await res.arrayBuffer();
            const timeToBody = Date.now() - startTime;
            log(`[${this.providerId} API] Downloaded body (${buffer.byteLength} bytes) in ${timeToBody}ms`);
            
            clearTimeout(timeout);
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }

            const jsonString = Buffer.from(buffer).toString('utf-8');
            return JSON.parse(jsonString);
        } catch (error: any) {
            clearTimeout(timeout);
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
            log(`[${this.providerId} API] Fetch failed: ${error?.message || error}`);
            throw error;
        }
    }

    private async postChatCompletionsT8star(body: any, apiKey: string, stream: boolean, signal?: AbortSignal) {
        const url = this.resolveUrl(this.textBaseUrl, "/v1/chat/completions");
        console.log(`[${this.providerId} postChatCompletions] Starting request to ${url} with model ${body.model}...`);
        const startTime = Date.now();
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Accept: stream ? "text/event-stream" : "application/json",
                    "Content-Type": "application/json",
                    ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify(body),
                signal: signal as any,
            });

            console.log(`[${this.providerId} postChatCompletions] Received response headers with status ${res.status} in ${Date.now() - startTime}ms`);

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`HTTP Error: ${res.status} ${text}`);
            }

            if (!stream) {
                const json = await res.json();
                console.log(`[${this.providerId} postChatCompletions] Finished JSON parsing in ${Date.now() - startTime}ms`);
                return json;
            }

            const responseText = await res.text();
            let fullText = "";
            const lines = responseText.split(/\r?\n/);
            for (const raw of lines) {
                const line = raw.trim();
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try {
                    const json = JSON.parse(data);
                    const delta = json?.choices?.[0]?.delta?.content;
                    if (typeof delta === "string") fullText += delta;
                } catch { }
            }
            console.log(`[${this.providerId} postChatCompletions] Finished Stream parsing in ${Date.now() - startTime}ms`);
            return { _stream: true, fullText };
        } catch (error: any) {
            console.error(`[${this.providerId} postChatCompletions] Error after ${Date.now() - startTime}ms:`, error);
            throw error;
        }
    }

    private async fetchImageAsBase64(url: string): Promise<string | null> {
        try {
            const res = await fetch(url);
            const buffer = await res.buffer();
            const contentType = res.headers.get('content-type') || 'image/png';
            return `data:${contentType};base64,${buffer.toString('base64')}`;
        } catch (e) {
            console.error(`[${this.providerId}] Failed to fetch image for base64 conversion:`, url, e);
            return null;
        }
    }

    private async prepareVideoImageForApi(
        input: string,
        options: { maxBytes: number }
    ): Promise<{ value: string; bytes: number }> {
        if (!input) return { value: "", bytes: 0 };
        if (isHttpUrl(input)) return { value: input, bytes: 0 };

        const dataUrl = normalizeImageToDataUrl(input);
        const parsed = parseDataUrl(dataUrl);
        const base64 = (parsed?.base64 || "").trim().replace(/\s+/g, "");
        const bytes = base64ByteSize(base64);

        if (bytes <= options.maxBytes) {
            return { value: dataUrl, bytes };
        }

        const attempt1 = await compressDataUrlToJpegBase64(dataUrl, 1024, 0.82);
        if (attempt1 && base64ByteSize(attempt1) <= options.maxBytes) {
            return { value: `data:image/jpeg;base64,${attempt1}`, bytes: base64ByteSize(attempt1) };
        }

        const attempt2 = await compressDataUrlToJpegBase64(dataUrl, 768, 0.76);
        if (attempt2 && base64ByteSize(attempt2) <= options.maxBytes) {
            return { value: `data:image/jpeg;base64,${attempt2}`, bytes: base64ByteSize(attempt2) };
        }

        const attempt3 = await compressDataUrlToJpegBase64(dataUrl, 512, 0.7);
        if (attempt3) return { value: `data:image/jpeg;base64,${attempt3}`, bytes: base64ByteSize(attempt3) };

        return { value: dataUrl, bytes };
    }

    async generateContent(args: GenerateContentArgs): Promise<GenerateContentResponse> {
        const { model, contents, config } = args;
        const cleanModel = model.split(':')[0];

        const messages: any[] = [];

        if (config?.systemInstruction) {
            messages.push({ role: "system", content: String(config.systemInstruction) });
        }

        if (typeof contents === "string") {
            messages.push({ role: "user", content: contents });
        } else if (contents?.parts && Array.isArray(contents.parts)) {
            const parts = contents.parts;
            const contentParts: any[] = [];
            for (const p of parts) {
                if (typeof p?.text === "string") {
                    contentParts.push({ type: "text", text: p.text });
                } else if (p?.inlineData?.mimeType && p?.inlineData?.data) {
                    const rawData = p.inlineData.data;
                    let url = "";

                    if (rawData.startsWith("http")) {
                        const b64 = await this.fetchImageAsBase64(rawData);
                        if (b64) url = b64;
                        else url = rawData;
                    } else if (rawData.startsWith("data:")) {
                        url = rawData;
                    } else {
                        url = `data:${p.inlineData.mimeType};base64,${rawData}`;
                    }

                    contentParts.push({
                        type: "image_url",
                        image_url: { url },
                    });
                }
            }
            messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
        } else if (Array.isArray(contents)) {
            const contentParts: any[] = [];
            for (const c of contents) {
                if (typeof c?.text === "string") contentParts.push({ type: "text", text: c.text });
                else if (c?.inlineData?.mimeType && c?.inlineData?.data) {
                    const rawData = c.inlineData.data;
                    let url = "";

                    if (rawData.startsWith("http")) {
                        const b64 = await this.fetchImageAsBase64(rawData);
                        if (b64) url = b64;
                        else url = rawData;
                    } else if (rawData.startsWith("data:")) {
                        url = rawData;
                    } else {
                        url = `data:${c.inlineData.mimeType};base64,${rawData}`;
                    }

                    contentParts.push({
                        type: "image_url",
                        image_url: { url },
                    });
                }
            }
            messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
        } else {
            messages.push({ role: "user", content: "" });
        }

        if (this.isCompatibleModel(cleanModel)) {
            const stream = !!config?.stream;

            const body: any = {
                model: cleanModel,
                stream,
                messages,
            };

            if (config?.responseSchema) {
                const schema = cleanModel.includes('gpt-') ? normalizeSchemaTypes(config.responseSchema) : config.responseSchema;
                body.tools = [{
                    type: "function",
                    function: {
                        name: "submit_structured_output",
                        description: "Submit the structured output data",
                        parameters: schema
                    }
                }];
                body.tool_choice = {
                    type: "function",
                    function: { name: "submit_structured_output" }
                };
            } else if (config?.responseMimeType === "application/json") {
                body.response_format = { type: "json_object" };
            }

            if (typeof config?.temperature === "number") body.temperature = config.temperature;
            if (typeof config?.top_p === "number") body.top_p = config.top_p;
            if (typeof config?.max_tokens === "number") body.max_tokens = config.max_tokens;

            const googleExtra: any = {};
            if (config?.imageConfig) {
                const imageConfig = { ...config.imageConfig };
                if (imageConfig.aspectRatio && !imageConfig.aspect_ratio) {
                    imageConfig.aspect_ratio = imageConfig.aspectRatio;
                }
                delete imageConfig.aspectRatio;
                googleExtra.image_config = imageConfig;
            }
            if (config?.speechConfig) googleExtra.speech_config = config.speechConfig;
            if (config?.responseModalalities) googleExtra.response_modalities = config.responseModalalities;
            if (config?.responseSchema && !cleanModel.includes('gpt-')) googleExtra.response_schema = config.responseSchema;

            if (Object.keys(googleExtra).length) {
                body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
            }

            const defaultKey = (cleanModel?.includes("nano-banana") || cleanModel?.includes("nanobanana")) && this.nanobananaApiKey
                ? this.nanobananaApiKey
                : this.textApiKey;
            const activeApiKey = this.getApiKey(cleanModel, defaultKey);
            const data = await this.postChatCompletionsT8star(body, activeApiKey, stream, config?.signal);

            if (data?._stream) {
                const text = data.fullText || "";
                return { text, candidates: [{ content: { parts: [{ text }] } }] };
            }

            const msg = data?.choices?.[0]?.message;

            if (msg?.tool_calls?.[0]?.function?.arguments) {
                const text = msg.tool_calls[0].function.arguments;
                return { text, candidates: [{ content: { parts: [{ text }] } }] };
            }

            const inline = this.extractInlineB64(msg?.content);
            if (inline) {
                return {
                    text: "",
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        inlineData: {
                                            mimeType: inline.mimeType,
                                            data: inline.b64,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            }

            const text = typeof msg?.content === "string" ? msg.content : "";
            return { text, candidates: [{ content: { parts: [{ text }] } }] };
        }

        if (cleanModel === "gemini-3.1-flash-image-preview-2k" || cleanModel.includes("image") || cleanModel.includes("imagen") || cleanModel === "nano-banana-pro") {
            let prompt = "";
            let refImages: string[] = [];

            for (const msg of messages) {
                if (msg.role === "user") {
                    if (typeof msg.content === "string") {
                        prompt += msg.content + "\n";
                    } else if (Array.isArray(msg.content)) {
                        for (const part of msg.content) {
                            if (part.type === "text" && part.text) {
                                prompt += part.text + "\n";
                            } else if (part.type === "image_url" && part.image_url?.url) {
                                refImages.push(part.image_url.url);
                            }
                        }
                    }
                }
            }

            prompt = prompt.trim();
            let imageSize = "2K";
            let aspectRatio = "16:9";

            if (config?.imageConfig?.aspectRatio) {
                aspectRatio = config.imageConfig.aspectRatio;
            } else if (config?.imageConfig?.aspect_ratio) {
                aspectRatio = config.imageConfig.aspect_ratio;
            }
            
            if (config?.imageConfig?.overrideNanoAspectRatio) {
               aspectRatio = config.imageConfig.overrideNanoAspectRatio;
            }
            if (config?.imageConfig?.overrideNanoSize) {
               imageSize = config.imageConfig.overrideNanoSize;
            }

            let defaultKey = this.imageApiKey;
            if ((cleanModel?.includes("nano-banana") || cleanModel?.includes("nanobanana")) && this.nanobananaApiKey) {
                defaultKey = this.nanobananaApiKey;
            } else if (config?.imageConfig?.useOfficialKey) {
                defaultKey = process.env.T8_OFFICIAL_IMAGE_KEY || this.imageApiKey;
            }
            const apiKey = this.getApiKey(cleanModel, defaultKey);

            const imageBody: any = {
                model: cleanModel,
                prompt: prompt,
                response_format: "url",
            };

            if (config?.imageConfig?.useOfficialKey || (cleanModel === "gpt-image-2" && config?.imageConfig?.size)) {
                 if (config.imageConfig.size) {
                    imageBody.size = config.imageConfig.size;
                 }
                 if (config.imageConfig.quality) {
                    imageBody.quality = config.imageConfig.quality;
                 }
            } else {
                imageBody.image_size = imageSize;
                imageBody.aspect_ratio = aspectRatio;
            }

            if (refImages.length > 0) {
                imageBody.image = refImages;
            }

            const imageData = await this.postJson(this.mediaBaseUrl, "/v1/images/generations", imageBody, apiKey, config?.signal);
            
            let b64 = imageData?.b64_json || imageData?.data?.[0]?.b64_json || imageData?.image?.b64_json || imageData?.output?.b64_json;
            let url = imageData?.data?.[0]?.url || imageData?.url;

            if (url && typeof url === "string" && url.startsWith("http")) {
                 return {
                    text: `![image](${url})`,
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: `![image](${url})`,
                                    },
                                ],
                            },
                        },
                    ],
                };
            }

            if (b64) {
                 b64 = b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, "");
                 return {
                    text: "",
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        inlineData: {
                                            mimeType: "image/png",
                                            data: b64,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            }
            throw new Error(`Failed to extract image from response: ${JSON.stringify(imageData)}`);
        }

        const body: any = { model: cleanModel, stream: false, messages };

        const googleExtra: any = {};
        if (config?.imageConfig) {
            const imageConfig = { ...config.imageConfig };
            if (imageConfig.aspectRatio && !imageConfig.aspect_ratio) {
                imageConfig.aspect_ratio = imageConfig.aspectRatio;
            }
            delete imageConfig.aspectRatio;
            googleExtra.image_config = imageConfig;
        }
        if (config?.speechConfig) googleExtra.speech_config = config.speechConfig;
        if (config?.responseModalalities) googleExtra.response_modalities = config.responseModalalities;
        if (config?.responseSchema) googleExtra.response_schema = config.responseSchema;
        if (Object.keys(googleExtra).length) {
            body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
        }

        const data = await this.postJson(this.mediaBaseUrl, "/v1/chat/completions", body, this.imageApiKey, config?.signal);
        const message = data?.choices?.[0]?.message;

        const inline = this.extractInlineB64(message?.content);
        if (inline) {
            return {
                text: "",
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: inline.mimeType,
                                        data: inline.b64,
                                    },
                                },
                            ],
                        },
                    },
                ],
            };
        }

        let text = "";
        if (typeof message?.content === "string") text = message.content;
        else if (Array.isArray(message?.content)) {
            text = message.content
                .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
                .join("");
        }

        return { text, candidates: [{ content: { parts: [{ text }] } }] };
    }

    async generateVideos(args: GenerateVideosArgs): Promise<VideosOperation> {
        const { model, prompt, image, config } = args;
        const cleanModel = model.split(':')[0];

        const isSeedance = cleanModel.includes("seedance") || cleanModel.includes("doubao");
        const isVeo = cleanModel.includes("veo");
        const isV2Protocol = isVeo || isSeedance;
        const defaultKey = isSeedance ? this.imageApiKey : this.videoApiKey;
        const activeApiKey = this.getApiKey(cleanModel, defaultKey);

        if (!isV2Protocol) {
            const NodeFormData = require('form-data');
            const form = new NodeFormData();
            form.append("model", cleanModel);
            form.append("prompt", prompt);
            form.append("seconds", String(config?.seconds ?? 8));

            const ar = config?.aspectRatio;
            let size = "1280x720";
            if (ar === "9:16") size = "720x1280";
            if (config?.size) size = config.size;
            form.append("size", size);

            if (config?.input_reference) {
                form.append("input_reference", String(config.input_reference));
            } else if (image?.imageBytes) {
                const bin = Buffer.from(image.imageBytes, 'base64');
                form.append("input_reference", bin, {
                    filename: "input.png",
                    contentType: image.mimeType || "image/png"
                });
            }

            const data = await this.postForm("/v1/videos", form, activeApiKey);
            const id = data?.id;
            return { done: false, operation: { id }, response: undefined, error: undefined };
        }

        let imagesToSend: string[] = config?.images || [];
        if (imagesToSend.length === 0 && image?.imageBytes) {
            imagesToSend.push(`data:${image.mimeType || 'image/png'};base64,${image.imageBytes}`);
        }

        const maxTotalBytes = 6 * 1024 * 1024;
        const maxSingleBytes = 3 * 1024 * 1024;

        const uploadedImages = imagesToSend;

        const prepared = (await Promise.all(
            uploadedImages
                .map((img) => this.prepareVideoImageForApi(img, { maxBytes: maxSingleBytes }))
        )).filter((x) => !!x.value);

        const payloadBytes = (items: Array<{ value: string; bytes: number }>) =>
            items.reduce((sum, it) => sum + (isHttpUrl(it.value) ? 0 : it.bytes), 0);

        let finalImages = prepared;
        while (payloadBytes(finalImages) > maxTotalBytes && finalImages.length > 1) {
            finalImages = finalImages.slice(1);
        }

        if (payloadBytes(finalImages) > maxTotalBytes && finalImages.length === 1 && !isHttpUrl(finalImages[0].value)) {
            const more = await this.prepareVideoImageForApi(finalImages[0].value, { maxBytes: maxTotalBytes });
            finalImages = [{ value: more.value, bytes: more.bytes }];
        }

        const enhancePrompt = !!config?.enhance_prompt;
        const aspectRatio = config?.aspectRatio || '16:9';

        let url = this.resolveUrl(this.mediaBaseUrl, "/v2/videos/generations");
        let payload: any = {};

        if (isSeedance && config?.seedanceContent) {
            url = this.resolveUrl(this.mediaBaseUrl, "/seedance/v3/contents/generations/tasks");
            
            const uploadMediaIfBase64 = async (mediaStr: string, defaultName: string): Promise<string> => {
                if (mediaStr.startsWith('data:')) {
                    const match = mediaStr.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const mimeType = match[1];
                        const base64Data = match[2];
                        const buffer = Buffer.from(base64Data, 'base64');
                        let ext = mimeType.split('/')[1] || 'bin';
                        if (ext === 'quicktime') ext = 'mov';
                        const filename = `${defaultName}.${ext}`;
                        console.log(`[${this.providerId}] Uploading base64 media (${buffer.length} bytes) as ${filename}...`);
                        return await this.uploadFile(buffer, mimeType, filename, activeApiKey);
                    }
                }
                return mediaStr;
            };

            const finalContent = [{ type: 'text', text: prompt }];
            
            for (let i = 0; i < config.seedanceContent.length; i++) {
                const item = config.seedanceContent[i];
                if (item.type === 'image_url') {
                    item.image_url.url = await uploadMediaIfBase64(item.image_url.url, `image_${Date.now()}_${i}`);
                } else if (item.type === 'video_url') {
                    item.video_url.url = await uploadMediaIfBase64(item.video_url.url, `video_${Date.now()}_${i}`);
                } else if (item.type === 'audio_url') {
                    item.audio_url.url = await uploadMediaIfBase64(item.audio_url.url, `audio_${Date.now()}_${i}`);
                }
                finalContent.push(item);
            }

            payload = {
                model: cleanModel,
                content: finalContent,
                generate_audio: true,
                ratio: aspectRatio,
                duration: config?.seconds || 8,
                watermark: false
            };
        } else {
            payload = {
                prompt: prompt,
                model: cleanModel,
                enhance_prompt: enhancePrompt,
                images: finalImages.map((x) => x.value),
                aspect_ratio: aspectRatio,
            };

            if (isSeedance) {
                const uploadMediaIfBase64 = async (mediaStr: string, defaultName: string): Promise<string> => {
                    if (mediaStr.startsWith('data:')) {
                        const match = mediaStr.match(/^data:([^;]+);base64,(.+)$/);
                        if (match) {
                            const mimeType = match[1];
                            const base64Data = match[2];
                            const buffer = Buffer.from(base64Data, 'base64');
                            let ext = mimeType.split('/')[1] || 'bin';
                            if (ext === 'quicktime') ext = 'mov';
                            const filename = `${defaultName}.${ext}`;
                            console.log(`[${this.providerId}] Uploading base64 media (${buffer.length} bytes) as ${filename}...`);
                            return await this.uploadFile(buffer, mimeType, filename, activeApiKey);
                        }
                    }
                    return mediaStr;
                };

                if (config?.videos && config.videos.length > 0) {
                    payload.videos = await Promise.all(
                        config.videos.map((v: string, i: number) => uploadMediaIfBase64(v, `video_${Date.now()}_${i}`))
                    );
                }
                if (config?.audios && config.audios.length > 0) {
                    payload.audios = await Promise.all(
                        config.audios.map((a: string, i: number) => uploadMediaIfBase64(a, `audio_${Date.now()}_${i}`))
                    );
                }
            }
        }

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${activeApiKey}`,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`Submit failed (${res.status}): ${errText || res.statusText}`);
        }

        const submitData: any = await res.json().catch(() => ({}));
        const taskId =
            submitData?.task_id ||
            submitData?.taskId ||
            submitData?.id ||
            submitData?.data?.task_id ||
            submitData?.data?.taskId ||
            submitData?.data?.id;

        if (!taskId) throw new Error(`No task_id returned: ${JSON.stringify(submitData)}`);

        return {
            done: false,
            operation: { id: taskId, status: 'SUBMITTED' },
            response: undefined,
            error: undefined
        };
    }

    private async postForm(path: string, form: any, apiKey: string) {
        const url = this.resolveUrl(this.mediaBaseUrl, path);
        const res = await fetch(url, {
            method: "POST",
            headers: { 
                Accept: "application/json", 
                "Authorization": `Bearer ${apiKey}`,
                ...form.getHeaders()
            },
            body: form,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }
        return res.json() as Promise<any>;
    }

    private async getJson(path: string, apiKey: string) {
        const url = this.resolveUrl(this.mediaBaseUrl, path);
        const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", "Authorization": `Bearer ${apiKey}` },
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }
        return res.json() as Promise<any>;
    }

    async getVideosOperation(args: GetVideosOperationArgs): Promise<VideosOperation> {
        const id = args?.operation?.operation?.id;
        if (!id) return args.operation;

        const isSeedance = id.startsWith("cgt-");
        const activeApiKey = isSeedance ? this.imageApiKey : this.videoApiKey;

        try {
            let url = this.resolveUrl(this.mediaBaseUrl, `/v2/videos/generations/${encodeURIComponent(id)}`);
            if (isSeedance) {
                url = this.resolveUrl(this.mediaBaseUrl, `/seedance/v3/contents/generations/tasks/${encodeURIComponent(id)}`);
            }
            
            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${activeApiKey}`,
                },
            });

            if (res.ok) {
                const statusData: any = await res.json().catch(() => ({}));
                const status = statusData?.status || statusData?.data?.status;

                if (status === "failed" || status === "FAILURE") {
                    return {
                        done: true,
                        operation: { id, status },
                        error: statusData?.fail_reason || statusData?.data?.fail_reason || statusData?.error?.message || "Video generation failed"
                    };
                }

                if (status === "succeeded" || status === "SUCCESS") {
                    const outputUrl = statusData?.data?.content?.video_url || statusData?.data?.output || statusData?.output || statusData?.data?.video_url || statusData?.video_url || statusData?.content?.video_url;
                    return {
                        done: true,
                        operation: { id, status },
                        response: { generatedVideos: [{ video: { uri: outputUrl } }] }
                    };
                }

                return {
                    done: false,
                    operation: { id, status: status || 'IN_PROGRESS' }
                };
            }
        } catch (e) {
        }

        const data = await this.getJson(`/v1/videos/${encodeURIComponent(id)}`, activeApiKey);
        const status = data?.status;

        let uri = data?.video_url || data?.url || "";
        if (uri && !uri.includes("?")) uri = `${uri}?`;

        const done = status === "completed" && !!uri;

        return {
            done,
            operation: { id, status },
            response: done ? { generatedVideos: [{ video: { uri } }] } : undefined,
            error: data?.error,
        };
    }

    async speech(body: any): Promise<ArrayBuffer> {
        const url = this.resolveUrl(this.textBaseUrl, "/v1/audio/speech");
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/octet-stream",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.audioApiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }

        return res.arrayBuffer();
    }

    async uploadFile(fileBuffer: Buffer, mimeType: string, filename: string, apiKey?: string): Promise<string> {
        const NodeFormData = require('form-data');
        const form = new NodeFormData();
        
        form.append("file", fileBuffer, {
            filename: filename || "upload.bin",
            contentType: mimeType || "application/octet-stream"
        });
        
        const keyToUse = apiKey || this.videoApiKey;
        const urlReq = this.resolveUrl(this.mediaBaseUrl, "/v1/files");
        try {
            const res = await fetch(urlReq, {
                method: "POST",
                headers: { 
                    Accept: "application/json", 
                    "Authorization": `Bearer ${keyToUse}`,
                    ...form.getHeaders()
                },
                body: form as any,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`HTTP Error: ${res.status} ${text}`);
            }
            const data = await res.json() as any;
            const url = data?.url || data?.data?.url;
            if (!url) {
                throw new Error(`Upload succeeded but no URL in response: ${JSON.stringify(data)}`);
            }
            return url;
        } catch (e: any) {
            console.error(`[OpenAICompatible - ${this.providerId}] File upload failed:`, e);
            throw e;
        }
    }
}
