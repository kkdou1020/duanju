import { GenerateContentResponse, VideosOperation } from "../../../shared/types";
import { IAIProvider, GenerateContentArgs, GenerateVideosArgs, GetVideosOperationArgs, AIProviderConfig } from "./interfaces";
import fetch from 'node-fetch';

export class PoloProvider implements IAIProvider {
    private config: AIProviderConfig;
    private baseUrl: string;
    private textApiKey: string;
    private imageApiKey: string;
    private videoApiKey: string;

    constructor(config?: AIProviderConfig) {
        this.config = config || {};
        this.baseUrl = this.config.baseUrl || "https://work.poloapi.com";

        // API keys from config (injected from .env)
        this.textApiKey = this.config.apiKey || process.env.POLO_TEXT_API_KEY || "";
        this.imageApiKey = this.config.mediaApiKey || process.env.POLO_IMAGE_API_KEY || "";
        this.videoApiKey = this.config.mediaApiKey || process.env.POLO_VIDEO_API_KEY || "";
    }

    private isImageModel(model?: string) {
        if (!model) return false;
        if (/image/i.test(model)) return true;
        if (/imagen/i.test(model)) return true;
        return false;
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

    private async postJson(path: string, body: any, apiKey: string, signal?: AbortSignal) {
        const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body),
            timeout: 15000, // 15 seconds timeout
            signal: signal as any,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP Error: ${res.status} ${text}`);
        }
        return res.json() as Promise<any>;
    }

    private async getJson(path: string) {
        const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
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

    private async postForm(path: string, form: FormData) {
        const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
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
                    contentParts.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                        },
                    });
                }
            }
            messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
        } else if (Array.isArray(contents)) {
            const contentParts: any[] = [];
            for (const c of contents) {
                if (typeof c?.text === "string") contentParts.push({ type: "text", text: c.text });
                else if (c?.inlineData?.mimeType && c?.inlineData?.data) {
                    contentParts.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${c.inlineData.mimeType};base64,${c.inlineData.data}`,
                        },
                    });
                }
            }
            messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
        } else {
            messages.push({ role: "user", content: "" });
        }

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

        const apiKey = this.isImageModel(model) ? this.imageApiKey : this.textApiKey;
        const data = await this.postJson("/v1/chat/completions", body, apiKey, config?.signal);
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

        return {
            text,
            candidates: [{ content: { parts: [{ text }] } }],
        };
    }

    async generateVideos(args: GenerateVideosArgs): Promise<VideosOperation> {
        const { model, prompt, image, config } = args;

        // --- Veo3 Chat Format Support ---
        if (model.startsWith("veo3-")) {
            const messages: any[] = [];
            const content: any[] = [{ type: "text", text: prompt }];

            if (image?.imageBytes) {
                const mime = image.mimeType || "image/png";
                const url = `data:${mime};base64,${image.imageBytes}`;
                content.push({
                    type: "image_url",
                    image_url: { url }
                });
            } else if (config?.input_reference) {
                content.push({
                    type: "image_url",
                    image_url: { url: config.input_reference }
                });
            }

            messages.push({ role: "user", content });

            const body: any = {
                model,
                stream: false,
                messages,
            };

            if (config?.temperature) body.temperature = config.temperature;
            if (config?.top_p) body.top_p = config.top_p;

            const data = await this.postJson("/v1/chat/completions", body, this.videoApiKey);

            const contentStr = data?.choices?.[0]?.message?.content || "";
            let videoUrl = "";

            const urlMatch = contentStr.match(/https?:\/\/[^\s)"]+/);
            if (urlMatch) videoUrl = urlMatch[0];

            if (videoUrl) {
                return {
                    done: true,
                    operation: { id: "chat-done", status: "completed" },
                    response: { generatedVideos: [{ video: { uri: videoUrl } }] }
                };
            }

            return {
                done: true,
                operation: { id: "chat-done", status: "completed" },
                response: undefined,
                error: "No video URL found in response: " + contentStr.substring(0, 100)
            };
        }

        // --- Veo3.1 Standard Format Support ---
        let finalModel = model;
        if (model === "veo3.1" || model === "veo3.1-components") {
            const isPortrait = config?.aspectRatio === "9:16";
            const isStartEnd = model === "veo3.1";

            if (isPortrait) {
                finalModel = isStartEnd ? "veo_3_1-portrait-hd-fl" : "veo_3_1-portrait-hd";
            } else {
                finalModel = isStartEnd ? "veo_3_1-landscape-hd-fl" : "veo_3_1-landscape-hd";
            }
        }

        const form = new FormData();
        form.append("model", finalModel);
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

    async getVideosOperation(args: GetVideosOperationArgs): Promise<VideosOperation> {
        const id = args?.operation?.operation?.id;
        if (!id) return args.operation;

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
}
