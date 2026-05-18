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
import fetch from 'node-fetch';

export class T8StarProvider implements IAIProvider {
    private config: AIProviderConfig;
    private textBaseUrl: string;
    private mediaBaseUrl: string;

    private textApiKey: string;
    private imageApiKey: string;
    private videoApiKey: string;
    private audioApiKey: string;

    constructor(config?: AIProviderConfig) {
        this.config = config || {};
        // In backend mode, use real external URLs directly
        this.textBaseUrl = this.config.baseUrl || "https://ai.t8star.cn";
        this.mediaBaseUrl = this.config.mediaBaseUrl || "https://ai.t8star.cn";

        // API keys read from config (injected from .env)
        this.textApiKey = this.config.apiKey || process.env.T8_TEXT_API_KEY || "";
        this.imageApiKey = this.config.mediaApiKey || process.env.T8_IMAGE_API_KEY || "";
        this.videoApiKey = this.config.mediaApiKey || process.env.T8_VIDEO_API_KEY || "";
        this.audioApiKey = this.config.audioApiKey || process.env.T8_AUDIO_API_KEY || "";
    }

    private isT8starModel(model?: string) {
        if (!model) return false;
        if (model.includes("image") || model.includes("imagen") || model === "nano-banana-pro") return false;
        return (
            model.includes("gemini") ||
            model.includes("nano-banana") ||
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

    private async postJson(baseUrl: string, path: string, body: any, apiKey: string) {
        const fs = require('fs');
        const logFile = 'C:\\Users\\Administrator\\Desktop\\duanju\\duanju0302\\server-debug.log';
        const log = (msg: string) => {
            const timeStr = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
            const line = `[${timeStr}] ${msg}\n`;
            console.log(line.trim());
            try { fs.appendFileSync(logFile, line); } catch(e){}
        };

        const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
        log(`[T8Star API] POST ${url}...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            log(`[T8Star API] ERROR: Hard timeout of 300s reached! Aborting connection.`);
            controller.abort();
        }, 300000); // 300s hard timeout

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
                signal: controller.signal as any, // Cast to any to avoid type mismatch with older node-fetch types
            });

            const timeToHeaders = Date.now() - startTime;
            log(`[T8Star API] POST ${url} returned ${res.status} in ${timeToHeaders}ms`);

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`HTTP Error: ${res.status} ${text}`);
            }

            // Read the body with an idle timeout
            const buffer = await res.arrayBuffer();
            const timeToBody = Date.now() - startTime;
            log(`[T8Star API] Downloaded body (${buffer.byteLength} bytes) in ${timeToBody}ms`);
            
            clearTimeout(timeout);

            const jsonString = Buffer.from(buffer).toString('utf-8');
            return JSON.parse(jsonString);
        } catch (error: any) {
            clearTimeout(timeout);
            log(`[T8Star API] Fetch failed: ${error?.message || error}`);
            throw error;
        }
    }

    private async postChatCompletionsT8star(body: any, apiKey: string, stream: boolean) {
        const url = `${this.textBaseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Accept: stream ? "text/event-stream" : "application/json",
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }

        if (!stream) return res.json() as Promise<any>;

        // Stream handling for Node.js
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
        return { _stream: true, fullText };
    }

    private async fetchImageAsBase64(url: string): Promise<string | null> {
        try {
            const res = await fetch(url);
            const buffer = await res.buffer();
            const contentType = res.headers.get('content-type') || 'image/png';
            return `data:${contentType};base64,${buffer.toString('base64')}`;
        } catch (e) {
            console.error("Failed to fetch image for base64 conversion:", url, e);
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

        if (this.isT8starModel(model)) {
            const stream = !!config?.stream;

            const body: any = {
                model,
                stream,
                messages,
            };

            if (config?.responseSchema) {
                body.tools = [{
                    type: "function",
                    function: {
                        name: "submit_structured_output",
                        description: "Submit the structured output data",
                        parameters: config.responseSchema
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
            if (config?.responseModalities) googleExtra.response_modalities = config.responseModalities;
            if (config?.responseSchema) googleExtra.response_schema = config.responseSchema;

            if (Object.keys(googleExtra).length) {
                body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
            }

            const data = await this.postChatCompletionsT8star(body, this.textApiKey, stream);

            if (data?._stream) {
                const text = data.fullText || "";
                return { text, candidates: [{ content: { parts: [{ text }] } }] };
            }

            const msg = data?.choices?.[0]?.message;

            // Function Calling: extract structured data from tool_calls
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

        // --- T8Star Image Generation Intercept ---
        if (model === "gemini-3.1-flash-image-preview-2k" || model.includes("image") || model.includes("imagen") || model === "nano-banana-pro") {
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


            let apiKey = this.imageApiKey;
            if (config?.imageConfig?.useOfficialKey) {
                apiKey = process.env.T8_OFFICIAL_IMAGE_KEY || this.imageApiKey;
            }

            const imageBody: any = {
                model: model,
                prompt: prompt,
                response_format: "url",
            };

            if (config?.imageConfig?.useOfficialKey || (model === "gpt-image-2" && config?.imageConfig?.size)) {
                 if (config.imageConfig.size) {
                    imageBody.size = config.imageConfig.size;
                 }
                 if (config.imageConfig.quality) {
                    imageBody.quality = config.imageConfig.quality;
                 }
            } else {
                // 原有的专门给非官方版本或者资产图使用的格式
                imageBody.image_size = imageSize;
                imageBody.aspect_ratio = aspectRatio;
            }

            if (refImages.length > 0) {
                imageBody.image = refImages;
            }

            const imageData = await this.postJson(this.mediaBaseUrl, "/v1/images/generations", imageBody, apiKey);
            
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
                 // Clean up any double data URI prefix
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
        // --- End Image Generation Intercept ---

        // Use mediaBaseUrl for other models (e.g. image generation fallback)
        const body: any = { model, stream: false, messages };

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
        if (config?.responseModalities) googleExtra.response_modalities = config.responseModalities;
        if (config?.responseSchema) googleExtra.response_schema = config.responseSchema;
        if (Object.keys(googleExtra).length) {
            body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
        }

        const data = await this.postJson(this.mediaBaseUrl, "/v1/chat/completions", body, this.imageApiKey);
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

        const isVeo = model.includes("veo");

        if (!isVeo) {
            const form = new FormData();
            form.append("model", model);
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
                const blob = new Blob([bin], { type: image.mimeType || "image/png" });
                form.append("input_reference", blob, "input.png");
            }

            const data = await this.postForm("/v1/videos", form);
            const id = data?.id;
            return { done: false, operation: { id }, response: undefined, error: undefined };
        }

        // --- T8Star Veo Logic ---
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

        const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}/v2/videos/generations`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.videoApiKey}`,
            },
            body: JSON.stringify({
                prompt: prompt,
                model,
                enhance_prompt: enhancePrompt,
                images: finalImages.map((x) => x.value),
                aspect_ratio: aspectRatio,
            }),
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

    private async postForm(path: string, form: FormData) {
        const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}${path}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { Accept: "application/json", "Authorization": `Bearer ${this.videoApiKey}` },
            body: form as any,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }
        return res.json() as Promise<any>;
    }

    private async getJson(path: string) {
        const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}${path}`;
        const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", "Authorization": `Bearer ${this.videoApiKey}` },
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

        try {
            const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}/v2/videos/generations/${encodeURIComponent(id)}`;
            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.videoApiKey}`,
                },
            });

            if (res.ok) {
                const statusData: any = await res.json().catch(() => ({}));
                const status = statusData?.status;

                if (status === "FAILURE") {
                    return {
                        done: true,
                        operation: { id, status },
                        error: statusData?.fail_reason || "Video generation failed"
                    };
                }

                if (status === "SUCCESS") {
                    const outputUrl = statusData?.data?.output || statusData?.output;
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
            // Fallback to legacy endpoint
        }

        const data = await this.getJson(`/v1/videos/${encodeURIComponent(id)}`);
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
        const url = `${this.textBaseUrl.replace(/\/+$/, "")}/v1/audio/speech`;
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
}
