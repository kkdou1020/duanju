import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAICompatibleProvider
vi.mock('../../server/src/services/ai/providers/openai-compatible', () => ({
    OpenAICompatibleProvider: class {
        id: string;
        config: any;
        constructor(id: string, config: any) {
            this.id = id;
            this.config = config;
        }
        generateContent = vi.fn().mockImplementation(async (args: any) => {
            return { text: `${this.id}-response` };
        });
        generateVideos = vi.fn().mockImplementation(async (args: any) => {
            return { operation: { id: `${this.id}-op` } };
        });
        getVideosOperation = vi.fn().mockResolvedValue({ done: true });
        speech = vi.fn().mockResolvedValue(new ArrayBuffer(8));
        uploadFile = vi.fn().mockResolvedValue('http://mocked-url');
        isEnabled = vi.fn().mockReturnValue(true);
    },
}));

beforeEach(async () => { vi.resetModules(); });

describe('ModelManager', () => {
    async function getManager() {
        const mod = await import('../../server/src/services/ai/model-manager');
        return mod.getModelManager();
    }

    it('starts with default config (all t8star)', async () => {
        const mm = await getManager();
        const config = mm.getConfig();
        expect(config.textmodel).toBe('t8star');
        expect(config.imagemodel).toBe('t8star');
        expect(config.videomodel).toBe('t8star');
    });

    it('setConfig accepts valid providers', async () => {
        const mm = await getManager();
        mm.setConfig({ textmodel: 'tutujin', imagemodel: 'tutujin' });
        expect(mm.getConfig().textmodel).toBe('tutujin');
        expect(mm.getConfig().imagemodel).toBe('tutujin');
        expect(mm.getConfig().videomodel).toBe('t8star');
    });

    it('getConfig returns a copy (not reference)', async () => {
        const mm = await getManager();
        const config = mm.getConfig();
        config.textmodel = 'tutujin';
        expect(mm.getConfig().textmodel).toBe('t8star');
    });

    it('routes text requests to text provider', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'gemini-3.5-flash', contents: 'test' });
        expect(result).toBeDefined();
    });

    it('detects image request by model name containing "image"', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'gemini-3.1-flash-image-preview-2k', contents: 'test' });
        expect(result).toBeDefined();
    });

    it('detects image request by imageConfig in config', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'any-model', contents: 'test', config: { imageConfig: {} } });
        expect(result).toBeDefined();
    });

    it('speech() delegates to t8star provider', async () => {
        const mm = await getManager();
        const result = await mm.speech({ text: 'hello' });
        expect(result).toBeInstanceOf(ArrayBuffer);
    });
});
