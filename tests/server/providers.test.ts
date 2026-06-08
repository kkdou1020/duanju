import { describe, it, expect } from 'vitest';

// Since these are private methods, we test them via (instance as any)
// This avoids changing the production code's encapsulation

// ════════════════════════════════════════════
// T8StarProvider
// ════════════════════════════════════════════
describe('T8StarProvider', () => {
    let provider: any;

    async function getProvider() {
        const { T8StarProvider } = await import('../../server/src/services/ai/providers/t8star');
        return new T8StarProvider();
    }

    // ─── isT8starModel ───
    describe('isT8starModel', () => {
        it('returns true for gemini-3-flash-preview', async () => {
            provider = await getProvider();
            expect(provider.isT8starModel('gemini-3-flash-preview')).toBe(true);
        });
        it('returns true for nano-banana-2-2k', async () => {
            provider = await getProvider();
            expect(provider.isT8starModel('nano-banana-2-2k')).toBe(true);
        });
        it('returns false for other models', async () => {
            provider = await getProvider();
            expect(provider.isT8starModel('claude-3')).toBe(false);
        });
        it('returns false for undefined', async () => {
            provider = await getProvider();
            expect(provider.isT8starModel(undefined)).toBe(false);
        });
        it('returns false for empty string', async () => {
            provider = await getProvider();
            expect(provider.isT8starModel('')).toBe(false);
        });
    });

    // ─── extractDataUrlFromText ───
    describe('extractDataUrlFromText', () => {
        it('extracts image data URL', async () => {
            provider = await getProvider();
            const result = provider.extractDataUrlFromText('data:image/png;base64,iVBOR=');
            expect(result).toEqual({ mimeType: 'image/png', b64: 'iVBOR=' });
        });
        it('extracts audio data URL', async () => {
            provider = await getProvider();
            const result = provider.extractDataUrlFromText('data:audio/wav;base64,UklGR=');
            expect(result).toEqual({ mimeType: 'audio/wav', b64: 'UklGR=' });
        });
        it('returns null for plain text', async () => {
            provider = await getProvider();
            expect(provider.extractDataUrlFromText('just plain text')).toBeNull();
        });
        it('returns null for empty string', async () => {
            provider = await getProvider();
            expect(provider.extractDataUrlFromText('')).toBeNull();
        });
        it('returns null for http URL', async () => {
            provider = await getProvider();
            expect(provider.extractDataUrlFromText('https://example.com/img.png')).toBeNull();
        });
    });

    // ─── extractInlineB64 ───
    describe('extractInlineB64', () => {
        it('extracts from string with data URL', async () => {
            provider = await getProvider();
            const result = provider.extractInlineB64('data:image/jpeg;base64,/9j/abc');
            expect(result).toEqual({ mimeType: 'image/jpeg', b64: '/9j/abc' });
        });

        it('extracts from JSON string with b64_json field', async () => {
            provider = await getProvider();
            const jsonStr = JSON.stringify({ b64_json: 'iVBORw0KGgo=' });
            const result = provider.extractInlineB64(jsonStr);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'iVBORw0KGgo=' });
        });

        it('extracts from JSON with nested data[0].b64_json', async () => {
            provider = await getProvider();
            const jsonStr = JSON.stringify({ data: [{ b64_json: 'abc123' }] });
            const result = provider.extractInlineB64(jsonStr);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'abc123' });
        });

        it('extracts from array with image_url part', async () => {
            provider = await getProvider();
            const parts = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xyz=' } }];
            const result = provider.extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'xyz=' });
        });

        it('extracts from array with audio_url part', async () => {
            provider = await getProvider();
            const parts = [{ type: 'audio_url', audio_url: { url: 'data:audio/mp3;base64,audiodata=' } }];
            const result = provider.extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'audio/mp3', b64: 'audiodata=' });
        });

        it('extracts from array with text containing data URL', async () => {
            provider = await getProvider();
            const parts = [{ type: 'text', text: 'data:image/png;base64,textdata=' }];
            const result = provider.extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/png', b64: 'textdata=' });
        });

        it('extracts from array with raw b64_json field (>100 chars)', async () => {
            provider = await getProvider();
            const longB64 = 'A'.repeat(200);
            const parts = [{ b64_json: longB64, mimeType: 'image/webp' }];
            const result = provider.extractInlineB64(parts);
            expect(result).toEqual({ mimeType: 'image/webp', b64: longB64 });
        });

        it('returns null for plain string without data URL', async () => {
            provider = await getProvider();
            expect(provider.extractInlineB64('just a string')).toBeNull();
        });

        it('returns null for null input', async () => {
            provider = await getProvider();
            expect(provider.extractInlineB64(null)).toBeNull();
        });
    });
});

// ════════════════════════════════════════════
// PoloProvider
// ════════════════════════════════════════════
describe('PoloProvider', () => {
    let provider: any;

    async function getProvider() {
        const { PoloProvider } = await import('../../server/src/services/ai/providers/polo');
        return new PoloProvider();
    }

    // ─── isImageModel ───
    describe('isImageModel', () => {
        it('returns true for model containing "image"', async () => {
            provider = await getProvider();
            expect(provider.isImageModel('gemini-3.1-flash-image-preview-2k')).toBe(true);
        });
        it('returns true for "imagen-3"', async () => {
            provider = await getProvider();
            expect(provider.isImageModel('imagen-3')).toBe(true);
        });
        it('returns false for text model', async () => {
            provider = await getProvider();
            expect(provider.isImageModel('gemini-pro')).toBe(false);
        });
        it('returns false for undefined', async () => {
            provider = await getProvider();
            expect(provider.isImageModel(undefined)).toBe(false);
        });
        it('is case-insensitive', async () => {
            provider = await getProvider();
            expect(provider.isImageModel('IMAGEN-3')).toBe(true);
        });
    });

    // ─── extractDataUrlFromText ───
    describe('extractDataUrlFromText', () => {
        it('extracts data URL from text', async () => {
            provider = await getProvider();
            expect(provider.extractDataUrlFromText('data:image/png;base64,abc='))
                .toEqual({ mimeType: 'image/png', b64: 'abc=' });
        });
        it('returns null for non-data URL', async () => {
            provider = await getProvider();
            expect(provider.extractDataUrlFromText('https://example.com')).toBeNull();
        });
    });

    // ─── extractInlineB64 ───
    describe('extractInlineB64', () => {
        it('extracts from string data URL', async () => {
            provider = await getProvider();
            expect(provider.extractInlineB64('data:image/jpeg;base64,/9j/'))
                .toEqual({ mimeType: 'image/jpeg', b64: '/9j/' });
        });

        it('extracts from JSON string with image.b64', async () => {
            provider = await getProvider();
            const jsonStr = JSON.stringify({ image: { b64: 'imagedata' } });
            expect(provider.extractInlineB64(jsonStr)).toEqual({ mimeType: 'image/png', b64: 'imagedata' });
        });

        it('extracts from array parts', async () => {
            provider = await getProvider();
            const parts = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,arrdata=' } }];
            expect(provider.extractInlineB64(parts)).toEqual({ mimeType: 'image/png', b64: 'arrdata=' });
        });

        it('returns null for empty array', async () => {
            provider = await getProvider();
            expect(provider.extractInlineB64([])).toBeNull();
        });
    });
});
