import { GenerateContentResponse, VideosOperation } from "../../../shared/types";

export interface GenerateContentArgs {
    model: string;
    contents: any;
    config?: any;
}

export interface GenerateVideosArgs {
    model: string;
    prompt: string;
    image?: { imageBytes: string; mimeType: string };
    config?: {
        enhance_prompt?: boolean;
        images?: string[];
        videos?: string[];
        audios?: string[];
        seedanceContent?: any[];
        aspectRatio?: string;
        seconds?: number;
        [key: string]: any;
    };
}

export interface GetVideosOperationArgs {
    operation: VideosOperation;
}

export interface IAIProvider {
    generateContent(args: GenerateContentArgs): Promise<GenerateContentResponse>;
    generateVideos(args: GenerateVideosArgs): Promise<VideosOperation>;
    getVideosOperation(args: GetVideosOperationArgs): Promise<VideosOperation>;
    speech?(body: any): Promise<ArrayBuffer>;
    uploadFile?(fileBuffer: Buffer, mimeType: string, filename: string): Promise<string>;
}

export interface AIProviderConfig {
    baseUrl?: string;
    apiKey?: string;
    mediaBaseUrl?: string;
    mediaApiKey?: string;
    audioApiKey?: string;
}
