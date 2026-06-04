export interface LensReference {
    shot_name: string;        // 参考片段名
    description: string;      // 解析 
    searchKeyword: string;    // 高精度搜索关键词
    timestamp: string;        // 剧情时刻
}

export interface PromptOption {
  option_id: string;        // "A" / "B" / "C"
  lens_reference: LensReference;
  np_prompt: string;        
  video_prompt: string;     
  imageUrl?: string;        // Option-specific image URL
  imageAssetId?: string;    // Option-specific image asset ID
  videoUrl?: string;        // Option-specific video URL
  videoAssetId?: string;    // Option-specific video asset ID
  operation?: any;          // Cache of AI operation for re-signing URL
  camera?: string;
  lens?: string;
  focal_length?: string;
  aperture?: string;
  textmodel?: string;
  imagemodel?: string;
  videomodel?: string;
  t8starImageModel?: string;
  t8starImageSize?: string;
  t8starImageQuality?: string;
  t8starNanoImageSize?: string;
  t8starNanoAspectRatio?: string;
  t8starVideoModel?: string;
}

export interface DialogueLine {
    speaker: string;
    text: string;
}

export interface Scene {
    id: string;
    narration: string;
    visual_desc: string;
    np_prompt: string;
    video_prompt?: string;
    camera?: string;
    lens?: string;
    focal_length?: string;
    aperture?: string;
    audio_dialogue?: DialogueLine[];
    audio_sfx?: string;
    audio_bgm?: string;
    prompt_options?: PromptOption[];
    selected_option_id?: string;
    imageUrl?: string;
    imageAssetId?: string;
    videoUrl?: string;
    videoAssetId?: string;
    startEndVideoUrl?: string;
    startEndVideoAssetId?: string;
    narrationAudioUrl?: string;
    assetIds?: string[];
    videoAssetIds?: string[];
    startEndAssetIds?: string[];
    useAssets?: boolean;
    isStartEndFrameMode?: boolean;
    video_prompt_backup?: string;
    status?: 'success' | 'failed' | 'pending';
    error?: string;
    operation?: any;                 // Cache of standard video operation
    startEndVideoOperation?: any;    // Cache of start/end video operation
    textmodel?: string;
    imagemodel?: string;
    videomodel?: string;
    t8starImageModel?: string;
    t8starImageSize?: string;
    t8starImageQuality?: string;
    t8starNanoImageSize?: string;
    t8starNanoAspectRatio?: string;
    t8starVideoModel?: string;
}



export interface GeneratedImage {
    sceneId: string;
    imageUrl: string;
}

export interface Asset {
    id: string;
    name: string;
    description: string;
    type: 'character' | 'location' | 'item' | 'video' | 'audio';
    visualDna?: string;
    refImageUrl?: string;
    refImageAssetId?: string;
    refVideoUrl?: string; // URL for video reference (Seedance)
    refAudioUrl?: string; // URL for audio reference (Seedance)
    prompt?: string;
    parentId?: string;
    variantName?: string;
}

export enum AnalysisStatus {
    IDLE = 'IDLE',
    ANALYZING = 'ANALYZING',
    EXTRACTING = 'EXTRACTING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export enum ImageGenStatus {
    IDLE = 'IDLE',
    GENERATING = 'GENERATING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export interface StyleSetting {
    selected: string;
    custom?: string;
    strength: number;
    seed: string;
    options: string[];
    useOriginalCharacters?: boolean;
}

export interface GlobalStyle {
    director: StyleSetting;
    work: StyleSetting;
    texture: StyleSetting;
    aspectRatio: '16:9' | '9:16';
    visualTags: string;
    visualDnaLocked?: boolean;
    narrationVoice: string;
}

export interface EpisodePlan {
    episode_number: number;
    title: string;
    logline: string;
    structure_breakdown?: any;
    script?: string;
    character_instructions?: Record<string, string>;
}

export interface NovelChunk {
    id: string;
    index: number;
    title?: string;
    text: string;
    status: 'idle' | 'extracting' | 'extracted' | 'scripting' | 'storyboarded' | 'scripted' | 'shooting' | 'completed';
    assets: Asset[];
    scenes: Scene[];
    episodeData?: EpisodePlan;
    batchMeta?: any;
    beatSheet?: any;
}

export type ContentPart = {
    text?: string;
    inlineData?: { mimeType: string; data: string };
    fileData?: { mimeType: string; fileUri: string };
};

export type GenerateContentResponse = {
    text?: string;
    candidates?: Array<{
        content?: {
            parts?: ContentPart[];
        };
    }>;
};

export type VideosOperation = {
    done: boolean;
    operation?: { id?: string; status?: string };
    response?: { generatedVideos?: Array<{ video?: { uri?: string } }> };
    error?: any;
};
