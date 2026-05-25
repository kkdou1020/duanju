import { describe, it, expect, vi } from 'vitest';
import { extractImageFromResponse } from '../../server/src/services/ai/media/image';

describe('extractImageFromResponse', () => {
    // ─── Inline Base64 ───
    it('extracts inline base64 image data', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' }
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('data:image/png;base64,iVBORw0KGgo=');
    });

    it('defaults mimeType to image/png when missing', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { data: 'abc123' }
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('data:image/png;base64,abc123');
    });

    // ─── URL extraction from text ───
    it('extracts URL from markdown image syntax', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: '![alt text](https://storage.example.com/image.png)'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://storage.example.com/image.png');
    });

    it('extracts bare URL from text', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: 'Here is the image: https://example.com/img.jpg'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://example.com/img.jpg');
    });

    it('handles "! " prefix in text', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: '! https://example.com/image.png'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://example.com/image.png');
    });

    // ─── Error cases ───
    it('throws when no candidates', () => {
        expect(() => extractImageFromResponse({ candidates: [] } as any)).toThrow('No candidates');
    });

    it('throws when candidates is undefined', () => {
        expect(() => extractImageFromResponse({} as any)).toThrow('No candidates');
    });

    it('throws on text refusal (no URL in text)', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: 'I cannot generate this image due to policy.'
                    }]
                }
            }]
        } as any;
        expect(() => extractImageFromResponse(response)).toThrow('Model Refusal');
    });

    it('throws when no image data at all', () => {
        const response = {
            candidates: [{
                content: { parts: [] }
            }]
        } as any;
        expect(() => extractImageFromResponse(response)).toThrow('No image data');
    });

    // ─── Priority: inlineData over text ───
    it('prefers inlineData over text URL', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [
                        { text: 'https://example.com/fallback.png' },
                        { inlineData: { mimeType: 'image/jpeg', data: '/9j/abc' } }
                    ]
                }
            }]
        } as any;
    });
});

describe('generateSceneImage camera parameters', () => {
    it('appends camera parameters correctly to finalPrompt', async () => {
        const { generateSceneImage } = await import('../../server/src/services/ai/media/image');
        const { ai } = await import('../../server/src/services/ai/helpers');

        const mockGenerateContent = vi.spyOn(ai.models, 'generateContent').mockResolvedValue({
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { mimeType: 'image/png', data: 'mock_base64_data' }
                    }]
                }
            }]
        } as any);

        const scene = {
            id: 'scene-1',
            np_prompt: 'A beautiful sunny day at the beach',
            camera: 'Arri Alexa Mini LF',
            lens: 'Cooke SF 1.8x',
            focal_length: '85',
            aperture: 'f/1.4'
        };

        const globalStyle = {
            aspectRatio: '16:9',
            visualDnaLocked: true,
            visualTags: '[Cinematic]'
        } as any;

        const result = await generateSceneImage(scene, globalStyle);

        expect(result.imageUrl).toBe('data:image/png;base64,mock_base64_data');
        expect(mockGenerateContent).toHaveBeenCalled();
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const lastPart = callArgs.contents.parts[callArgs.contents.parts.length - 1];
        expect(lastPart.text).toContain('Shot on Arri Alexa Mini LF');
        expect(lastPart.text).toContain('Cooke SF 1.8x lens');
        expect(lastPart.text).toContain('85mm');
        expect(lastPart.text).toContain('f/1.4');

        mockGenerateContent.mockRestore();
    });

    it('prioritizes option camera parameters over root scene parameters', async () => {
        const { generateSceneImage } = await import('../../server/src/services/ai/media/image');
        const { ai } = await import('../../server/src/services/ai/helpers');

        const mockGenerateContent = vi.spyOn(ai.models, 'generateContent').mockResolvedValue({
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { mimeType: 'image/png', data: 'mock_base64_data' }
                    }]
                }
            }]
        } as any);

        const scene = {
            id: 'scene-1',
            np_prompt: 'A beautiful sunny day at the beach',
            camera: 'Arri Alexa Mini LF',
            lens: 'Cooke SF 1.8x',
            focal_length: '85',
            aperture: 'f/1.4',
            prompt_options: [
                {
                    option_id: 'opt-a',
                    np_prompt: 'Option A prompt description',
                    camera: 'Sony Venice 2',
                    lens: 'Zeiss Supreme Prime',
                    focal_length: '35',
                    aperture: 'f/2.8'
                }
            ]
        };

        const globalStyle = {
            aspectRatio: '16:9',
            visualDnaLocked: true,
            visualTags: '[Cinematic]'
        } as any;

        await generateSceneImage(scene, globalStyle, [], 'opt-a');

        expect(mockGenerateContent).toHaveBeenCalled();
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const lastPart = callArgs.contents.parts[callArgs.contents.parts.length - 1];
        expect(lastPart.text).toContain('Shot on Sony Venice 2');
        expect(lastPart.text).toContain('Zeiss Supreme Prime lens');
        expect(lastPart.text).toContain('35mm');
        expect(lastPart.text).toContain('f/2.8');
        expect(lastPart.text).not.toContain('Arri Alexa Mini LF');

        mockGenerateContent.mockRestore();
    });

    it('filters out None and empty/undefined values', async () => {
        const { generateSceneImage } = await import('../../server/src/services/ai/media/image');
        const { ai } = await import('../../server/src/services/ai/helpers');

        const mockGenerateContent = vi.spyOn(ai.models, 'generateContent').mockResolvedValue({
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { mimeType: 'image/png', data: 'mock_base64_data' }
                    }]
                }
            }]
        } as any);

        const scene = {
            id: 'scene-1',
            np_prompt: 'A beautiful sunny day at the beach',
            camera: 'Red V-Raptor',
            lens: 'None',
            focal_length: '',
            aperture: undefined
        };

        const globalStyle = {
            aspectRatio: '16:9',
            visualDnaLocked: true,
            visualTags: '[Cinematic]'
        } as any;

        await generateSceneImage(scene, globalStyle);

        expect(mockGenerateContent).toHaveBeenCalled();
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const lastPart = callArgs.contents.parts[callArgs.contents.parts.length - 1];
        expect(lastPart.text).toContain('Shot on Red V-Raptor');
        expect(lastPart.text).not.toContain('lens');
        expect(lastPart.text).not.toContain('mm');
        expect(lastPart.text).not.toContain('f/');

        mockGenerateContent.mockRestore();
    });
});

