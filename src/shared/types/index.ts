
export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface Scene {
  id: string;
  narration: string;

  // Replaced simple visual_desc with detailed video specs
  visual_desc: string; // Keeps backward compatibility, but now acts as "Video Description"
  video_duration?: string; // e.g. "3s"
  video_camera?: string; // e.g. "Pan right", "Dolly in"
  video_lens?: string; // e.g. "35mm", "Wide angle"
  video_vfx?: string; // e.g. "Rain particles"

  np_prompt: string; // The Image Prompt

  // Multimodal Fields (Agent B)
  video_prompt?: string; // Full constructed video prompt
  prompt_options?: Array<{
    option_id: string;
    lens_reference: {
      shot_name: string;
      description: string;
      searchKeyword: string;
      video_url: string;
      timestamp: string;
    };
    video_lens: string;
    video_camera: string;
    video_prompt: string;
    np_prompt: string;
    imageUrl?: string;
    imageAssetId?: string;
    videoUrl?: string;
    videoAssetId?: string;
    assetIds?: string[];
    videoAssetIds?: string[];
  }>;
  audio_dialogue?: DialogueLine[];
  audio_sfx?: string;
  audio_bgm?: string;

  imageUrl?: string;
  imageAssetId?: string; // New: Persistent ID for image Blob in IndexedDB
  videoUrl?: string; // Generated Video URL (standard reference mode)
  videoAssetId?: string; // Persistent ID for video Blob in IndexedDB (standard reference mode)
  startEndVideoUrl?: string; // Generated Video URL (start/end frame mode)
  startEndVideoAssetId?: string; // Persistent ID for video Blob in IndexedDB (start/end frame mode)
  narrationAudioUrl?: string; // New: Generated Narration Audio URL (Blob URL)

  assetIds?: string[]; // IDs of assets appearing in this scene (Image Mode)
  videoAssetIds?: string[]; // IDs of assets used specifically for Video Mode (Independent from Image Mode)
  startEndAssetIds?: string[]; // IDs for Start/End Frame Mode [StartID, EndID?]
  useAssets?: boolean; // Whether to use assets for video generation
  isStartEndFrameMode?: boolean; // Whether to use Start/End Frame Mode (veo3.1-pro-4k)
  video_prompt_backup?: string; // Backup of video prompt for Start/End Frame Mode undo
}



export interface GeneratedImage {
  sceneId: string;
  imageUrl: string;
}

export interface Asset {
  id: string; // e.g. "hero_base"
  name: string;
  description: string;
  type: 'character' | 'location' | 'item' | 'video' | 'audio';
  visualDna?: string; // Specific visual tags for this asset
  refImageUrl?: string;
  refImageAssetId?: string; // New: Persistent ID for ref image Blob in IndexedDB
  prompt?: string; // The prompt used to generate the reference image
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
  useOriginalCharacters?: boolean; // Checkbox: Whether to use original characters from the reference work
}

export interface GlobalStyle {
  director: StyleSetting;
  work: StyleSetting;
  texture: StyleSetting;
  aspectRatio: '16:9' | '9:16';
  visualTags: string; // Global Visual DNA (Agent A)
  visualDnaLocked?: boolean; // Whether the Global Visual DNA is locked
  narrationVoice: string; // New: Selected Voice ID
}

// Helper Interfaces for Narrative Blueprint
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
  title?: string; // User-editable title
  text: string;
  status: 'idle' | 'extracting' | 'extracted' | 'scripting' | 'storyboarded' | 'scripted' | 'shooting' | 'completed';
  assets: Asset[];
  scenes: Scene[];
  episodeData?: EpisodePlan; // New: Stores the Agent 1 plan for this episode
  batchMeta?: any; // New: Stores the narrative state context
  beatSheet?: any; // Cached MasterBeatSheet from Agent 2, used for Step 2 prompt generation
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

