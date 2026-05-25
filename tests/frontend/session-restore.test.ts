import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock loadAssetUrl from storage service
const mockLoadAssetUrl = vi.fn();
vi.mock('@/services/storage', () => ({
    loadAssetUrl: (id: string) => mockLoadAssetUrl(id),
    loadState: vi.fn(),
    saveState: vi.fn(),
}));

import { hydrateScene } from '../../src/features/useSessionRestore';
import { Scene } from '../../src/shared/types';

describe('hydrateScene', () => {
    beforeEach(() => {
        mockLoadAssetUrl.mockReset();
    });

    it('should hydrate top-level image and video blob URLs if asset IDs exist', async () => {
        mockLoadAssetUrl.mockImplementation(async (id) => {
            if (id === 'img_123') return 'blob:http://localhost/new-img-blob';
            if (id === 'vid_456') return 'blob:http://localhost/new-vid-blob';
            return null;
        });

        const scene: Scene = {
            id: 'scene-1',
            narration: 'Test Scene',
            visual_desc: 'Test Desc',
            np_prompt: 'Test Prompt',
            imageUrl: 'blob:http://localhost/old-img-blob',
            imageAssetId: 'img_123',
            videoUrl: 'blob:http://localhost/old-vid-blob',
            videoAssetId: 'vid_456',
        };

        const hydrated = await hydrateScene(scene);

        expect(mockLoadAssetUrl).toHaveBeenCalledWith('img_123');
        expect(mockLoadAssetUrl).toHaveBeenCalledWith('vid_456');
        expect(hydrated.imageUrl).toBe('blob:http://localhost/new-img-blob');
        expect(hydrated.videoUrl).toBe('blob:http://localhost/new-vid-blob');
    });

    it('should hydrate nested prompt_options image and video blob URLs', async () => {
        mockLoadAssetUrl.mockImplementation(async (id) => {
            if (id === 'opt_img_a') return 'blob:http://localhost/new-opt-img-a';
            if (id === 'opt_vid_a') return 'blob:http://localhost/new-opt-vid-a';
            if (id === 'opt_img_b') return 'blob:http://localhost/new-opt-img-b';
            return null;
        });

        const scene: Scene = {
            id: 'scene-1',
            narration: 'Test Scene',
            visual_desc: 'Test Desc',
            np_prompt: 'Test Prompt',
            prompt_options: [
                {
                    option_id: 'A',
                    video_prompt: 'video prompt A',
                    np_prompt: 'image prompt A',
                    imageUrl: 'blob:http://localhost/old-opt-img-a',
                    imageAssetId: 'opt_img_a',
                    videoUrl: 'blob:http://localhost/old-opt-vid-a',
                    videoAssetId: 'opt_vid_a',
                    lens_reference: {
                        shot_name: 'Shot A',
                        description: 'Desc A',
                        searchKeyword: 'Keyword A',
                        video_url: 'http://cdn/vid-a.mp4',
                        timestamp: '00:01',
                    }
                },
                {
                    option_id: 'B',
                    video_prompt: 'video prompt B',
                    np_prompt: 'image prompt B',
                    imageUrl: 'blob:http://localhost/old-opt-img-b',
                    imageAssetId: 'opt_img_b',
                    // video does not exist
                    lens_reference: {
                        shot_name: 'Shot B',
                        description: 'Desc B',
                        searchKeyword: 'Keyword B',
                        video_url: 'http://cdn/vid-b.mp4',
                        timestamp: '00:02',
                    }
                }
            ]
        };

        const hydrated = await hydrateScene(scene);

        expect(mockLoadAssetUrl).toHaveBeenCalledWith('opt_img_a');
        expect(mockLoadAssetUrl).toHaveBeenCalledWith('opt_vid_a');
        expect(mockLoadAssetUrl).toHaveBeenCalledWith('opt_img_b');

        expect(hydrated.prompt_options).toBeDefined();
        expect(hydrated.prompt_options![0].imageUrl).toBe('blob:http://localhost/new-opt-img-a');
        expect(hydrated.prompt_options![0].videoUrl).toBe('blob:http://localhost/new-opt-vid-a');
        expect(hydrated.prompt_options![1].imageUrl).toBe('blob:http://localhost/new-opt-img-b');
        expect(hydrated.prompt_options![1].videoUrl).toBeUndefined();
    });

    it('should keep non-blob URLs and not query IndexedDB', async () => {
        const scene: Scene = {
            id: 'scene-1',
            narration: 'Test Scene',
            visual_desc: 'Test Desc',
            np_prompt: 'Test Prompt',
            imageUrl: 'https://external-image.com/img.png',
            imageAssetId: 'img_123',
            prompt_options: [
                {
                    option_id: 'A',
                    video_prompt: 'video prompt A',
                    np_prompt: 'image prompt A',
                    imageUrl: 'data:image/png;base64,xxxx',
                    videoUrl: 'http://external-video.com/vid.mp4',
                    videoAssetId: 'vid_789',
                    lens_reference: {
                        shot_name: 'Shot A',
                        description: 'Desc A',
                        searchKeyword: 'Keyword A',
                        video_url: 'http://cdn/vid-a.mp4',
                        timestamp: '00:01',
                    }
                }
            ]
        };

        const hydrated = await hydrateScene(scene);

        expect(mockLoadAssetUrl).not.toHaveBeenCalled();
        expect(hydrated.imageUrl).toBe('https://external-image.com/img.png');
        expect(hydrated.prompt_options![0].imageUrl).toBe('data:image/png;base64,xxxx');
        expect(hydrated.prompt_options![0].videoUrl).toBe('http://external-video.com/vid.mp4');
    });
});
