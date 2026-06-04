import { PoloProvider } from "./providers/polo";
import { T8StarProvider } from "./providers/t8star";
import { GoogleProvider } from "./providers/google";
import { IAIProvider, AIProviderConfig } from "./providers/interfaces";
import { GenerateContentResponse } from "../../shared/types";

export type ModelType = "text" | "image" | "video";
export type ProviderType = "polo" | "t8star" | "google";

/** Centralized model name constants */
export const MODELS = {
    TEXT_FAST: 'gemini-3.1-flash-lite-preview-thinking-high',
    TEXT_AGENT: 'gemini-3.1-flash-lite-preview-thinking-high',
    IMAGE_GEN: 'gpt-image-2',
    IMAGE_POLO_OVERRIDE: 'gemini-3-pro-image-preview',
    TTS: 'tts-1-hd-1106',
} as const;

export interface ModelConfig {
    textmodel: ProviderType;
    imagemodel: ProviderType;
    videomodel: ProviderType;
    t8starImageModel?: string;
    t8starImageSize?: string;
    t8starImageQuality?: string;
    t8starNanoImageSize?: string;
    t8starNanoAspectRatio?: string;
    t8starVideoModel?: string;
}

const DEFAULT_CONFIG: ModelConfig = {
    textmodel: "t8star",
    imagemodel: "t8star",
    videomodel: "t8star",
    t8starImageModel: "gpt-image-2",
    t8starImageSize: "auto",
    t8starImageQuality: "auto",
    t8starNanoImageSize: "2K",
    t8starNanoAspectRatio: "16:9",
    t8starVideoModel: "veo3.1-components",
};

const VALID_PROVIDERS: ProviderType[] = ["polo", "t8star", "google"];

class ModelManager {
    private config: ModelConfig;
    private polo: PoloProvider;
    private t8star: T8StarProvider;
    private google: GoogleProvider;

    constructor() {
        this.config = { ...DEFAULT_CONFIG };

        // Backend mode: use direct URLs with API keys from env
        const poloConfig: AIProviderConfig = {
            baseUrl: process.env.POLO_BASE_URL || "https://work.poloapi.com",
            apiKey: process.env.POLO_TEXT_API_KEY || "",
            mediaApiKey: process.env.POLO_IMAGE_API_KEY || "",
            videoApiKey: process.env.POLO_VIDEO_API_KEY || "",
        };

        const t8starConfig: AIProviderConfig = {
            baseUrl: process.env.T8_BASE_URL || "https://ai.t8star.cn",
            mediaBaseUrl: process.env.T8_MEDIA_BASE_URL || "https://ai.t8star.cn",
            apiKey: process.env.T8_TEXT_API_KEY || "",
            mediaApiKey: process.env.T8_IMAGE_API_KEY || "",
            videoApiKey: process.env.T8_VIDEO_API_KEY || "",
            audioApiKey: process.env.T8_AUDIO_API_KEY || "",
        };

        this.polo = new PoloProvider(poloConfig);
        this.t8star = new T8StarProvider(t8starConfig);
        this.google = new GoogleProvider({ apiKey: process.env.GOOGLE_API_KEY });
    }

    public setConfig(config: Partial<ModelConfig>) {
        for (const key of ["textmodel", "imagemodel", "videomodel"] as const) {
            if (config[key] && VALID_PROVIDERS.includes(config[key] as ProviderType)) {
                this.config[key] = config[key] as ProviderType;
            }
        }
        if (config.t8starImageModel && typeof config.t8starImageModel === 'string') {
            this.config.t8starImageModel = config.t8starImageModel;
        }
        if (config.t8starImageSize && typeof config.t8starImageSize === 'string') {
            this.config.t8starImageSize = config.t8starImageSize;
        }
        if (config.t8starImageQuality && typeof config.t8starImageQuality === 'string') {
            this.config.t8starImageQuality = config.t8starImageQuality;
        }
        if (config.t8starNanoImageSize && typeof config.t8starNanoImageSize === 'string') {
            this.config.t8starNanoImageSize = config.t8starNanoImageSize;
        }
        if (config.t8starNanoAspectRatio && typeof config.t8starNanoAspectRatio === 'string') {
            this.config.t8starNanoAspectRatio = config.t8starNanoAspectRatio;
        }
        if (config.t8starVideoModel && typeof config.t8starVideoModel === 'string') {
            this.config.t8starVideoModel = config.t8starVideoModel;
        }
    }

    public getConfig(): ModelConfig {
        return { ...this.config };
    }

    private getProvider(type: ModelType): IAIProvider {
        const providerName = this.config[`${type}model` as keyof ModelConfig];
        if (providerName === "google") return this.google;
        return providerName === "polo" ? this.polo : this.t8star;
    }

    public async generateContent(args: { model: string; contents: any; config?: any }): Promise<GenerateContentResponse> {
        const isImageRequest = args.config?.imageConfig ||
            (args.model && (args.model.includes("nano") || args.model.includes("flash-image") || args.model.includes("image")));

        let finalArgs = args;
        if (isImageRequest) {
            if (this.config.imagemodel === "polo") {
                finalArgs = { ...args, model: MODELS.IMAGE_POLO_OVERRIDE };
            } else if (this.config.imagemodel === "t8star") {
                let requestedModel = this.config.t8starImageModel || "gpt-image-2";
                const isAsset = args.config?.imageConfig?.isAsset;
                
                const newConfig = { ...(args.config || {}) };
                newConfig.imageConfig = { ...(newConfig.imageConfig || {}) };

                if (requestedModel === "gpt-image-2-official") {
                    requestedModel = "gpt-image-2"; 
                    if (!isAsset) {
                        newConfig.imageConfig.useOfficialKey = true;
                        newConfig.imageConfig.size = this.config.t8starImageSize || "auto";
                        newConfig.imageConfig.quality = this.config.t8starImageQuality || "auto";
                    }
                } else if (requestedModel === "gpt-image-2") {
                    if (!isAsset) {
                        newConfig.imageConfig.size = this.config.t8starImageSize || "auto";
                        newConfig.imageConfig.quality = this.config.t8starImageQuality || "auto";
                    }
                } else if (requestedModel === "nano-banana-pro") {
                    if (!isAsset) {
                        newConfig.imageConfig.overrideNanoSize = this.config.t8starNanoImageSize || "2K";
                        newConfig.imageConfig.overrideNanoAspectRatio = this.config.t8starNanoAspectRatio || "16:9";
                    }
                }
                finalArgs = { ...args, model: requestedModel, config: newConfig };
            }
        }

        const provider = isImageRequest ? this.getProvider("image") : this.getProvider("text");
        return provider.generateContent(finalArgs);
    }

    public async generateVideos(args: any) {
        const provider = this.getProvider("video");
        return provider.generateVideos(args);
    }

    public async getVideosOperation(args: any) {
        const provider = this.getProvider("video");
        return provider.getVideosOperation(args);
    }

    public async speech(body: any): Promise<ArrayBuffer> {
        if (this.t8star.speech) {
            return this.t8star.speech(body);
        }
        throw new Error("Speech generation not supported");
    }

    public async uploadFile(fileBuffer: Buffer, mimeType: string, filename: string): Promise<string> {
        if (this.t8star.uploadFile) {
            return this.t8star.uploadFile(fileBuffer, mimeType, filename);
        }
        throw new Error("File upload not supported by current provider");
    }
}

// Singleton
let _instance: ModelManager | null = null;

export function getModelManager(): ModelManager {
    if (!_instance) {
        _instance = new ModelManager();
    }
    return _instance;
}
