import { useState, useEffect } from 'react';

// Frontend model-manager — config only (AI logic moved to backend)

export type ModelType = "text" | "image" | "video";
export type ProviderType = "polo" | "t8star";

/** Centralized model name constants */
export const MODELS = {
  TEXT_FAST: 'gemini-3.5-flash',
  TEXT_AGENT: 'gemini-3.5-flash',
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

const VALID_PROVIDERS: ProviderType[] = ["polo", "t8star"];

/**
 * Frontend ModelManager — config only.
 * Stores/reads provider selection from localStorage for UI (ModelSelector).
 * Actual AI calls go through the backend API.
 */
class ModelManager {
  private config: ModelConfig;

  constructor() {
    this.config = this.loadConfig();
    
    // Sync to backend immediately on load (important if backend restarted causing lost state)
    if (typeof window !== "undefined") {
      setTimeout(() => {
        this.setConfig(this.config);
      }, 500);
    }
  }

  private loadConfig(): ModelConfig {
    if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
    const stored = localStorage.getItem("model_config");
    if (!stored) return DEFAULT_CONFIG;
    try {
      const parsed = JSON.parse(stored);
      const validated: ModelConfig = { ...DEFAULT_CONFIG };
      for (const key of ["textmodel", "imagemodel", "videomodel"] as const) {
        if (parsed[key] && VALID_PROVIDERS.includes(parsed[key])) {
          validated[key] = parsed[key];
        }
      }
        validated.t8starImageModel = parsed.t8starImageModel || "gpt-image-2";
        validated.t8starImageSize = parsed.t8starImageSize || "auto";
        validated.t8starImageQuality = parsed.t8starImageQuality || "auto";
        validated.t8starNanoImageSize = parsed.t8starNanoImageSize || "2K";
        validated.t8starNanoAspectRatio = parsed.t8starNanoAspectRatio || "16:9";
        validated.t8starVideoModel = parsed.t8starVideoModel || "veo3.1-components";
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
    // Also sync to backend
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
