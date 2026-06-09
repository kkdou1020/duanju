import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import { IAIProvider, AIProviderConfig } from "./providers/interfaces";
import { GenerateContentResponse, ProviderConfig } from "../../shared/types";

export type ModelType = "text" | "image" | "video";
export type ProviderType = string;

/** Centralized model name constants */
export const MODELS = {
    TEXT_FAST: 'gpt-5.4-mini-2026-03-17',
    TEXT_AGENT: 'gpt-5.4-mini-2026-03-17',
    IMAGE_GEN: 'gpt-image-2',
    TTS: 'tts-1-hd-1106',
} as const;

export interface ModelConfig {
    textmodel: ProviderType;
    imagemodel: ProviderType;
    videomodel: ProviderType;
    t8starTextModel?: string;
    t8starImageModel?: string;
    t8starImageSize?: string;
    t8starImageQuality?: string;
    t8starNanoImageSize?: string;
    t8starNanoAspectRatio?: string;
    t8starVideoModel?: string;
    providers?: ProviderConfig[];
}

const DEFAULT_CONFIG: ModelConfig = {
    textmodel: "t8star",
    imagemodel: "t8star",
    videomodel: "t8star",
    t8starTextModel: "gpt-5.4-mini-2026-03-17",
    t8starImageModel: "gpt-image-2",
    t8starImageSize: "auto",
    t8starImageQuality: "auto",
    t8starNanoImageSize: "2K",
    t8starNanoAspectRatio: "16:9",
    t8starVideoModel: "veo3.1-components",
    providers: [
        {
            id: "t8star",
            name: "T8Star",
            baseUrl: "https://ai.t8star.org",
            apiKey: "",
            enabled: true,
            showInNode: true,
            imageModels: ["gpt-image-2", "nano-banana-pro", "gpt-image-2-official"],
            videoModels: ["veo3.1-components:auto", "veo3.1:start_end_frame", "doubao-seedance-2-0-260128:start_end_frame,auto"],
            chatModels: ["gpt-5.4-mini-2026-03-17", "gemini-3.5-flash"]
        },
        {
            id: "tutujin",
            name: "tutujin",
            baseUrl: "https://api.tutujin.com/v1",
            apiKey: "",
            enabled: true,
            showInNode: true,
            imageModels: ["gpt-image-2", "nano-banana-2", "gemini-3.1-flash-image-preview-2k"],
            videoModels: ["veo3.1-components:auto", "veo3.1:start_end_frame", "doubao-seedance-2-0-260128:start_end_frame,auto"],
            chatModels: ["gpt-5.4-mini-2026-03-17", "gemini-3.5-flash"]
        }
    ]
};

class ModelManager {
    private config: ModelConfig;
    private providers: Map<string, OpenAICompatibleProvider> = new Map();

    constructor() {
        // Load default providers configuration with environment variables
        const initialProviders = DEFAULT_CONFIG.providers!.map(p => {
            const prefix = p.id === "t8star" ? "T8" : p.id.toUpperCase();
            const envKey = process.env[`${prefix}_TEXT_API_KEY`] || process.env[`${prefix}_API_KEY`] || (p.id === "t8star" ? process.env.API_KEY : "") || "";
            const imageEnvKey = process.env[`${prefix}_IMAGE_API_KEY`];
            const videoEnvKey = process.env[`${prefix}_VIDEO_API_KEY`];
            const audioEnvKey = process.env[`${prefix}_AUDIO_API_KEY`];
            const nanobananaEnvKey = process.env[`${prefix}_NANOBANANA_API_KEY`] || (p.id === "t8star" ? process.env.NANOBANANA_API_KEY : "");
            return {
                ...p,
                apiKey: envKey,
                imageApiKey: imageEnvKey || p.imageApiKey || "",
                videoApiKey: videoEnvKey || p.videoApiKey || "",
                audioApiKey: audioEnvKey || p.audioApiKey || "",
                nanobananaApiKey: nanobananaEnvKey || p.nanobananaApiKey || "",
                baseUrl: process.env[`${prefix}_BASE_URL`] || p.baseUrl
            };
        });

        this.config = {
            ...DEFAULT_CONFIG,
            providers: initialProviders
        };

        this.updateProviders(initialProviders);
    }

    private updateProviders(configs: ProviderConfig[]) {
        this.providers.clear();
        for (const providerConfig of configs) {
            if (!providerConfig.enabled) continue;

            const prefix = providerConfig.id === "t8star" ? "T8" : providerConfig.id.toUpperCase();
            
            // Prioritize UI-edited/supplied API keys over server environment variables
            const textKey = providerConfig.apiKey || process.env[`${prefix}_TEXT_API_KEY`] || process.env[`${prefix}_API_KEY`] || (providerConfig.id === "t8star" ? process.env.API_KEY : "");
            const imageKey = providerConfig.imageApiKey || providerConfig.apiKey || process.env[`${prefix}_IMAGE_API_KEY`] || process.env[`${prefix}_API_KEY`];
            const videoKey = providerConfig.videoApiKey || providerConfig.apiKey || process.env[`${prefix}_VIDEO_API_KEY`] || process.env[`${prefix}_API_KEY`];
            const audioKey = providerConfig.audioApiKey || providerConfig.apiKey || process.env[`${prefix}_AUDIO_API_KEY`] || process.env[`${prefix}_API_KEY`];
            const nanobananaKey = providerConfig.nanobananaApiKey || providerConfig.apiKey || process.env[`${prefix}_NANOBANANA_API_KEY`] || process.env.NANOBANANA_API_KEY;

            const fullConfig = {
                baseUrl: providerConfig.baseUrl,
                mediaBaseUrl: providerConfig.baseUrl,
                apiKey: textKey,
                mediaApiKey: imageKey,
                videoApiKey: videoKey,
                audioApiKey: audioKey,
                nanobananaApiKey: nanobananaKey,
                modelApiKeys: providerConfig.modelApiKeys || {},
                enabled: providerConfig.enabled
            };

            const provider = new OpenAICompatibleProvider(providerConfig.id, fullConfig);
            this.providers.set(providerConfig.id, provider);
        }
    }

    public setConfig(config: Partial<ModelConfig>) {
        console.log(`[DEBUG] ModelManager.setConfig:`, JSON.stringify(config));
        if (config.textmodel && typeof config.textmodel === 'string') {
            this.config.textmodel = config.textmodel;
        }
        if (config.imagemodel && typeof config.imagemodel === 'string') {
            this.config.imagemodel = config.imagemodel;
        }
        if (config.videomodel && typeof config.videomodel === 'string') {
            this.config.videomodel = config.videomodel;
        }
        if (config.t8starTextModel && typeof config.t8starTextModel === 'string') {
            this.config.t8starTextModel = config.t8starTextModel;
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
        if (config.providers && Array.isArray(config.providers)) {
            this.config.providers = config.providers;
            this.updateProviders(config.providers);
        }
    }

    public getConfig(): ModelConfig {
        return { ...this.config };
    }

    private getProvider(type: ModelType): OpenAICompatibleProvider {
        const providerName = this.config[`${type}model` as keyof ModelConfig];
        if (typeof providerName === 'string') {
            const provider = this.providers.get(providerName);
            if (provider) return provider;
        }
        return this.providers.get("t8star")!;
    }

    public async generateContent(args: { model: string; contents: any; config?: any }): Promise<GenerateContentResponse> {
        const isImageRequest = args.config?.imageConfig ||
            (args.model && (args.model.includes("nano") || args.model.includes("flash-image") || args.model.includes("image")));

        let finalArgs = args;
        if (isImageRequest) {
            const customModel = args.config?.imageConfig?.customModel;
            const customSize = args.config?.imageConfig?.customSize;
            const customQuality = args.config?.imageConfig?.customQuality;

            let requestedModel = customModel || this.config.t8starImageModel || "gpt-image-2";
            const isAsset = args.config?.imageConfig?.isAsset;
            
            const newConfig = { ...(args.config || {}) };
            newConfig.imageConfig = { ...(newConfig.imageConfig || {}) };

            const sizeMap: Record<string, Record<string, string>> = {
                '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' },
                '3:2': { '1K': '1200x800', '2K': '1536x1024', '4K': '3072x2048' },
                '2:3': { '1K': '800x1200', '2K': '1024x1536', '4K': '2048x3072' },
                '4:3': { '1K': '1152x864', '2K': '1408x1056', '4K': '2880x2160' },
                '3:4': { '1K': '864x1152', '2K': '1056x1408', '4K': '2160x2880' },
                '5:4': { '1K': '1280x1024', '2K': '1600x1280', '4K': '3200x2560' },
                '4:5': { '1K': '1024x1280', '2K': '1280x1600', '4K': '2560x3200' },
                '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
                '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
                '2:1': { '1K': '1280x640', '2K': '2048x1024', '4K': '4096x2048' },
                '1:2': { '1K': '640x1280', '2K': '1024x2048', '4K': '2048x4096' },
                '21:9': { '1K': '1680x720', '2K': '2464x1056', '4K': '3360x1440' },
                '9:21': { '1K': '720x1680', '2K': '1056x2464', '4K': '1440x3360' },
            };

            const resolveGptImageSize = (sizeVal: string | undefined): string => {
                let baseSize = sizeVal;
                if (!baseSize || baseSize === 'auto') {
                    const ar = args.config?.imageConfig?.aspectRatio || args.config?.imageConfig?.aspect_ratio;
                    if (ar && ar !== 'auto') {
                        baseSize = ar;
                    } else {
                        return this.config.t8starImageSize || 'auto';
                    }
                }
                if (baseSize.includes('x')) {
                    return baseSize;
                }
                const ratio = baseSize;
                const res = '2K';
                if (sizeMap[ratio]?.[res]) {
                    return sizeMap[ratio][res];
                }
                return baseSize;
            };

            if (requestedModel === "gpt-image-2-official") {
                requestedModel = "gpt-image-2"; 
                if (!isAsset) {
                    newConfig.imageConfig.useOfficialKey = true;
                    newConfig.imageConfig.size = resolveGptImageSize(customSize);
                    newConfig.imageConfig.quality = customQuality || this.config.t8starImageQuality || "auto";
                }
            } else if (requestedModel === "gpt-image-2") {
                if (!isAsset) {
                    newConfig.imageConfig.size = resolveGptImageSize(customSize);
                    newConfig.imageConfig.quality = customQuality || this.config.t8starImageQuality || "auto";
                }
            } else if (requestedModel === "nano-banana-pro") {
                if (!isAsset) {
                    const nanoSize = (customQuality && customQuality.includes("K")) ? customQuality : 
                                     (customSize && customSize.includes("K")) ? customSize : 
                                     (this.config.t8starNanoImageSize || "2K");
                    const nanoRatio = (customSize && customSize.includes(":")) ? customSize : 
                                      (args.config?.imageConfig?.aspectRatio || args.config?.imageConfig?.aspect_ratio || this.config.t8starNanoAspectRatio || "16:9");
                    newConfig.imageConfig.overrideNanoSize = nanoSize;
                    newConfig.imageConfig.overrideNanoAspectRatio = nanoRatio;
                }
            }
            finalArgs = { ...args, model: requestedModel, config: newConfig };
        } else {
            if (!args.model || args.model === MODELS.TEXT_FAST || args.model === MODELS.TEXT_AGENT) {
                if (this.config.t8starTextModel) {
                    finalArgs = { ...args, model: this.config.t8starTextModel };
                }
            }
        }

        const providerName = this.config[isImageRequest ? "imagemodel" : "textmodel"];
        const provider = this.getProvider(isImageRequest ? "image" : "text");

        try {
            return await provider.generateContent(finalArgs);
        } catch (error) {
            // Failover retry
            const backupName = providerName === "t8star" ? "tutujin" : "t8star";
            const backupProvider = this.providers.get(backupName);
            if (backupProvider && backupProvider.isEnabled()) {
                console.warn(`[ModelManager Failover] Primary provider '${providerName}' failed: ${error}. Retrying with backup provider '${backupName}'...`);
                try {
                    return await backupProvider.generateContent(finalArgs);
                } catch (backupErr) {
                    console.error(`[ModelManager Failover] Backup provider '${backupName}' also failed: ${backupErr}`);
                    throw backupErr;
                }
            }
            throw error;
        }
    }

    public async generateVideos(args: any) {
        const providerName = this.config.videomodel;
        const provider = this.getProvider("video");
        try {
            return await provider.generateVideos(args);
        } catch (error) {
            // Failover retry
            const backupName = providerName === "t8star" ? "tutujin" : "t8star";
            const backupProvider = this.providers.get(backupName);
            if (backupProvider && backupProvider.isEnabled()) {
                console.warn(`[ModelManager Failover] Primary video generation failed: ${error}. Retrying with backup provider '${backupName}'...`);
                try {
                    const res = await backupProvider.generateVideos(args);
                    if (res.operation) {
                        res.operation.useBackup = true;
                    }
                    return res;
                } catch (backupErr) {
                    console.error(`[ModelManager Failover] Backup video generation also failed: ${backupErr}`);
                    throw backupErr;
                }
            }
            throw error;
        }
    }

    public async getVideosOperation(args: any) {
        const providerName = this.config.videomodel;
        const useBackup = args?.operation?.operation?.useBackup || args?.operation?.useBackup;
        
        let provider = this.getProvider("video");
        if (useBackup) {
            const backupProvider = this.providers.get(providerName === "t8star" ? "tutujin" : "t8star");
            if (backupProvider) provider = backupProvider;
        }
        return provider.getVideosOperation(args);
    }

    public async speech(body: any): Promise<ArrayBuffer> {
        const provider = this.getProvider("text");
        try {
            if (provider.speech) {
                return await provider.speech(body);
            }
        } catch (error) {
            const backupProvider = this.providers.get(this.config.textmodel === "t8star" ? "tutujin" : "t8star");
            if (backupProvider && backupProvider.speech) {
                console.warn(`[ModelManager Failover] Primary speech failed. Retrying with backup...`);
                return await backupProvider.speech(body);
            }
            throw error;
        }
        throw new Error("Speech generation not supported");
    }

    public async uploadFile(fileBuffer: Buffer, mimeType: string, filename: string): Promise<string> {
        const provider = this.getProvider("video");
        try {
            if (provider.uploadFile) {
                return await provider.uploadFile(fileBuffer, mimeType, filename);
            }
        } catch (error) {
            const backupProvider = this.providers.get(this.config.videomodel === "t8star" ? "tutujin" : "t8star");
            if (backupProvider && backupProvider.uploadFile) {
                console.warn(`[ModelManager Failover] Primary uploadFile failed. Retrying with backup...`);
                return await backupProvider.uploadFile(fileBuffer, mimeType, filename);
            }
            throw error;
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
