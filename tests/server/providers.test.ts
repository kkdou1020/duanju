import { describe, it, expect, vi } from 'vitest';

// Test suite for OpenAICompatibleProvider (replacing deleted T8StarProvider & PoloProvider)
describe('OpenAICompatibleProvider', () => {
    let provider: any;

    async function getProvider() {
        const { OpenAICompatibleProvider } = await import('../../server/src/services/ai/providers/openai-compatible');
        return new OpenAICompatibleProvider('t8star');
    }

    // ─── extractDataUrlFromText ───
    describe('extractDataUrlFromText', () => {
        it('extracts image data URL', async () => {
            provider = await getProvider();
            const result = (provider as any).extractDataUrlFromText('data:image/png;base64,iVBOR=');
            expect(result).toEqual({ mimeType: 'image/png', b64: 'iVBOR=' });
        });
        it('extracts audio data URL', async () => {
            provider = await getProvider();
            const result = (provider as any).extractDataUrlFromText('data:audio/wav;base64,UklGR=');
            expect(result).toEqual({ mimeType: 'audio/wav', b64: 'UklGR=' });
        });
        it('returns null for plain text', async () => {
            provider = await getProvider();
            expect((provider as any).extractDataUrlFromText('just plain text')).toBeNull();
        });
        it('returns null for empty string', async () => {
            provider = await getProvider();
            expect((provider as any).extractDataUrlFromText('')).toBeNull();
        });
        it('returns null for http URL', async () => {
            provider = await getProvider();
            expect((provider as any).extractDataUrlFromText('https://example.com/img.png')).toBeNull();
        });
    });

    // ─── extractInlineB64 ───
    describe('extractInlineB64', () => {
        it('extracts from string with data URL', async () => {
            provider = await getProvider();
            const result = (provider as any).extractInlineB64('data:image/jpeg;base64,/9j/abc');
            expect(result).toEqual({ mimeType: 'image/jpeg', b64: '/9j/abc' });
        });

        it('extracts from JSON string with b64_json field', async () => {
            provider = await getProvider();
            const jsonStr = JSON.stringify({ b64_json: 'iVBORw0KGgo=' });
            const result = (provider as any).extractInlineB64(jsonStr);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'iVBORw0KGgo=' });
        });

        it('extracts from JSON with nested data[0].b64_json', async () => {
            provider = await getProvider();
            const jsonStr = JSON.stringify({ data: [{ b64_json: 'abc123' }] });
            const result = (provider as any).extractInlineB64(jsonStr);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'abc123' });
        });

        it('extracts from array with image_url part', async () => {
            provider = await getProvider();
            const parts = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xyz=' } }];
            const result = (provider as any).extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'xyz=' });
        });

        it('extracts from array with audio_url part', async () => {
            provider = await getProvider();
            const parts = [{ type: 'audio_url', audio_url: { url: 'data:audio/mp3;base64,audiodata=' } }];
            const result = (provider as any).extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'audio/mp3', b64: 'audiodata=' });
        });

        it('extracts from array with text containing data URL', async () => {
            provider = await getProvider();
            const parts = [{ type: 'text', text: 'data:image/png;base64,textdata=' }];
            const result = (provider as any).extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'textdata=' });
        });

        it('extracts from array with raw b64_json field (>100 chars)', async () => {
            provider = await getProvider();
            const longB64 = 'A'.repeat(200);
            const parts = [{ b64_json: longB64, mimeType: 'image/webp' }];
            const result = (provider as any).extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/webp', b64: longB64 });
        });

        it('returns null for plain string without data URL', async () => {
            provider = await getProvider();
            expect((provider as any).extractInlineB64('just a string')).toBeNull();
        });

        it('returns null for null input', async () => {
            provider = await getProvider();
            expect((provider as any).extractInlineB64(null)).toBeNull();
        });
    });

    // ─── API Key Routing ───
    describe('API Key Routing', () => {
        it('uses nanobananaApiKey for nano-banana-pro model in generateContent', async () => {
            const { OpenAICompatibleProvider } = await import('../../server/src/services/ai/providers/openai-compatible');
            const customProvider = new OpenAICompatibleProvider('t8star', {
                apiKey: 'text-key',
                mediaApiKey: 'image-key',
                nanobananaApiKey: 'banana-key'
            });

            let usedKey = '';
            (customProvider as any).postJson = async (baseUrl: string, path: string, body: any, apiKey: string) => {
                usedKey = apiKey;
                return { data: [{ url: 'http://example.com/image.png' }] };
            };

            await customProvider.generateContent({
                model: 'nano-banana-pro',
                contents: 'test prompt'
            });

            expect(usedKey).toBe('banana-key');
        });

        it('uses nanobananaApiKey for text models containing nano-banana', async () => {
            const { OpenAICompatibleProvider } = await import('../../server/src/services/ai/providers/openai-compatible');
            const customProvider = new OpenAICompatibleProvider('t8star', {
                apiKey: 'text-key',
                mediaApiKey: 'image-key',
                nanobananaApiKey: 'banana-key'
            });

            let usedKey = '';
            (customProvider as any).postChatCompletionsT8star = async (body: any, apiKey: string, stream: boolean) => {
                usedKey = apiKey;
                return { choices: [{ message: { content: 'hello' } }] };
            };

            await customProvider.generateContent({
                model: 'nano-banana-2-2k',
                contents: 'test prompt'
            });

            expect(usedKey).toBe('banana-key');
        });

        it('falls back to default keys for non-nanobanana models', async () => {
            const { OpenAICompatibleProvider } = await import('../../server/src/services/ai/providers/openai-compatible');
            const customProvider = new OpenAICompatibleProvider('t8star', {
                apiKey: 'text-key',
                mediaApiKey: 'image-key',
                nanobananaApiKey: 'banana-key'
            });

            let textUsedKey = '';
            (customProvider as any).postChatCompletionsT8star = async (body: any, apiKey: string, stream: boolean) => {
                textUsedKey = apiKey;
                return { choices: [{ message: { content: 'hello' } }] };
            };

            let imageUsedKey = '';
            (customProvider as any).postJson = async (baseUrl: string, path: string, body: any, apiKey: string) => {
                imageUsedKey = apiKey;
                return { data: [{ url: 'http://example.com/image.png' }] };
            };

            await customProvider.generateContent({
                model: 'gemini-3.5-flash',
                contents: 'test'
            });
            expect(textUsedKey).toBe('text-key');

            await customProvider.generateContent({
                model: 'gpt-image-2',
                contents: 'test'
            });
            expect(imageUsedKey).toBe('image-key');
        });
    });
});
