import { useState, useEffect } from 'react';
import { ProviderConfig } from '@/shared/types';

// Frontend model-manager — config only (AI logic moved to backend)

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
  providers: ProviderConfig[];
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
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
];

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
  providers: DEFAULT_PROVIDERS
};

/**
 * Frontend ModelManager — config only.
 * Stores/reads provider selection from localStorage for UI.
 * Actual AI calls go through the backend API.
 */
class ModelManager {
  private config: ModelConfig;

  constructor() {
    this.config = this.loadConfig();
    
    // Sync to backend and pull backend keys loaded from .env
    if (typeof window !== "undefined") {
      fetch('/api/config')
        .then(res => res.json())
        .then(backendConfig => {
          if (backendConfig && backendConfig.providers) {
            // Merge backend providers (which has keys loaded from .env) with local storage configs
            const mergedProviders = this.config.providers.map(p => {
              const backendP = backendConfig.providers.find((bp: any) => bp.id === p.id);
              if (backendP) {
                const updated = { ...p };
                if (backendP.apiKey && !p.apiKey) updated.apiKey = backendP.apiKey;
                if (backendP.imageApiKey && !p.imageApiKey) updated.imageApiKey = backendP.imageApiKey;
                if (backendP.videoApiKey && !p.videoApiKey) updated.videoApiKey = backendP.videoApiKey;
                if (backendP.audioApiKey && !p.audioApiKey) updated.audioApiKey = backendP.audioApiKey;
                if (backendP.nanobananaApiKey && !p.nanobananaApiKey) updated.nanobananaApiKey = backendP.nanobananaApiKey;
                if (backendP.modelApiKeys) {
                  updated.modelApiKeys = { ...backendP.modelApiKeys, ...p.modelApiKeys };
                }
                
                // If backend baseUrl changed, update local as well
                if (backendP.baseUrl && p.baseUrl === DEFAULT_PROVIDERS.find(dp => dp.id === p.id)?.baseUrl) {
                  updated.baseUrl = backendP.baseUrl;
                }
                return updated;
              }
              return p;
            });
            const newConfig = {
              ...DEFAULT_CONFIG,
              ...backendConfig,
              ...this.config,
              providers: mergedProviders
            };
            this.config = newConfig;
            localStorage.setItem("model_config", JSON.stringify(newConfig));
            
            // Sync the merged config back to the backend so the backend knows the active channels
            fetch('/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newConfig),
            }).catch(e => console.warn('Failed to sync merged config to backend on startup:', e));

            window.dispatchEvent(new Event('model_config_changed'));
          } else {
            this.setConfig(this.config);
          }
        })
        .catch(e => {
          console.warn('Failed to load config from backend:', e);
          this.setConfig(this.config);
        });
    }
  }

  private loadConfig(): ModelConfig {
    if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
    const stored = localStorage.getItem("model_config");
    if (!stored) return DEFAULT_CONFIG;
    try {
      const parsed = JSON.parse(stored);
      const validated: ModelConfig = { ...DEFAULT_CONFIG };
      
      const validProviderIds = (parsed.providers || DEFAULT_PROVIDERS).map((p: any) => p.id);
      
      for (const key of ["textmodel", "imagemodel", "videomodel"] as const) {
        if (parsed[key] && validProviderIds.includes(parsed[key])) {
          validated[key] = parsed[key];
        }
      }
      
      validated.t8starTextModel = parsed.t8starTextModel || "gpt-5.4-mini-2026-03-17";
      
      validated.t8starImageModel = parsed.t8starImageModel || "gpt-image-2";
      validated.t8starImageSize = parsed.t8starImageSize || "auto";
      validated.t8starImageQuality = parsed.t8starImageQuality || "auto";
      validated.t8starNanoImageSize = parsed.t8starNanoImageSize || "2K";
      validated.t8starNanoAspectRatio = parsed.t8starNanoAspectRatio || "16:9";
      validated.t8starVideoModel = parsed.t8starVideoModel || "veo3.1-components";
      validated.providers = parsed.providers || DEFAULT_PROVIDERS;
      return validated;
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  public setConfig(config: Partial<ModelConfig>) {
    this.config = { ...this.config, ...config };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("model_config", JSON.stringify(this.config));
    }
    // Sync to backend
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.config),
    }).catch(e => console.warn('Failed to sync config to backend:', e));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event('model_config_changed'));
    }
  }

  public getConfig(): ModelConfig {
    return { ...this.config };
  }
}

export const modelManager = new ModelManager();

export function useModelConfig(): ModelConfig {
  const [config, setConfig] = useState<ModelConfig>(modelManager.getConfig());

  useEffect(() => {
    const handleConfigChange = () => {
      setConfig(modelManager.getConfig());
    };
    window.addEventListener('model_config_changed', handleConfigChange);
    return () => {
      window.removeEventListener('model_config_changed', handleConfigChange);
    };
  }, []);

  return config;
}

export interface ParsedVideoModel {
  name: string;
  modes: ('start_end_frame' | 'auto')[];
}

export function parseVideoModel(modelStr: string): ParsedVideoModel {
  if (modelStr.includes(':')) {
    const [name, modesStr] = modelStr.split(':');
    const modes = modesStr.split(',').filter(m => m === 'start_end_frame' || m === 'auto') as ('start_end_frame' | 'auto')[];
    return { name: name.trim(), modes };
  }
  // 默认兜底机制，保障旧版本数据兼容性
  const name = modelStr.trim();
  if (name === 'veo3.1-components') {
    return { name, modes: ['auto'] };
  }
  if (name === 'veo3.1') {
    return { name, modes: ['start_end_frame'] };
  }
  const lower = name.toLowerCase();
  if (lower.includes('seedance') || lower.includes('doubao')) {
    return { name, modes: ['start_end_frame', 'auto'] };
  }
  return { name, modes: ['start_end_frame', 'auto'] };
}
