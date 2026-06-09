import { describe, it, expect, vi } from 'vitest';
import { matchAssetsToPrompt, constructVideoPrompt, submitVideoGeneration, pollVideoStatus, parseMaxDurationFromPrompt } from '../../server/src/services/ai/media/video';
import { Asset, Scene, GlobalStyle } from '../../server/src/shared/types';
import { ai } from '../../server/src/services/ai/helpers';
import { getModelManager } from '../../server/src/services/ai/model-manager';

// ─── Fixtures ───
const ASSETS: Asset[] = [
    { id: 'hero', name: '岑矜', description: 'tall man with dark hair', type: 'character', refImageUrl: 'data:image/png;base64,hero' } as any,
    { id: 'heroine', name: '沈璃', description: 'woman in red dress', type: 'character', refImageUrl: 'data:image/png;base64,heroine' } as any,
    { id: 'scene_hall', name: '大殿', description: 'grand hall gold pillars', type: 'scene', refImageUrl: 'data:image/png;base64,hall' } as any,
    { id: 'no_image', name: '无图角色', description: 'no ref image', type: 'character' } as any,
];

const baseScene = (overrides: Partial<Scene> = {}): Scene => ({
    id: 'S01',
    visual_desc: '岑矜走进大殿',
    ...overrides,
} as Scene);

// ════════════════════════════════════════════
// matchAssetsToPrompt
// ════════════════════════════════════════════
describe('matchAssetsToPrompt', () => {
    it('scores +100 for explicitly listed asset IDs', () => {
        expect(matchAssetsToPrompt('random text', ASSETS, ['hero'])[0].id).toBe('hero');
    });
    it('scores +50 for name match in prompt', () => {
        const ids = matchAssetsToPrompt('岑矜走进大殿', ASSETS).map(a => a.id);
        expect(ids).toContain('hero');
        expect(ids).toContain('scene_hall');
    });
    it('filters out assets without refImageUrl', () => {
        expect(matchAssetsToPrompt('无图角色 appears', ASSETS).map(a => a.id)).not.toContain('no_image');
    });
    it('returns empty when nothing matches', () => {
        expect(matchAssetsToPrompt('completely unrelated text', ASSETS)).toHaveLength(0);
    });
    it('sorts by score descending (explicit ID > name match)', () => {
        expect(matchAssetsToPrompt('岑矜 和 沈璃', ASSETS, ['heroine'])[0].id).toBe('heroine');
    });
    it('scores token overlap from description', () => {
        const result = matchAssetsToPrompt('dark hair man walks', ASSETS);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].id).toBe('hero');
    });
});

// ════════════════════════════════════════════
// constructVideoPrompt
// ════════════════════════════════════════════
describe('constructVideoPrompt', () => {
    it('uses video_prompt when available', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A cinematic shot of the hall' }))).toBe('A cinematic shot of the hall');
    });
    it('falls back to visual_desc when no video_prompt', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: undefined }))).toBe('岑矜走进大殿');
    });
    it('prepends style prefix when not already present', () => {
        const scene = baseScene({ video_prompt: 'A shot of a hall' });
        const style: GlobalStyle = { visualTags: '[Anime][Fantasy]' } as any;
        expect(constructVideoPrompt(scene, style).startsWith('[Anime][Fantasy]. A shot')).toBe(true);
    });
    it('does NOT double-prepend style prefix', () => {
        const scene = baseScene({ video_prompt: '[Anime][Fantasy]. A shot' });
        const style: GlobalStyle = { visualTags: '[Anime][Fantasy]' } as any;
        expect(constructVideoPrompt(scene, style)).toBe('[Anime][Fantasy]. A shot');
    });
    it('appends audio dialogue', () => {
        const result = constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_dialogue: [{ speaker: '岑矜', text: '你好' }] }));
        expect(result).toContain('Character Dialogue');
        expect(result).toContain('岑矜: 你好');
    });
    it('appends sound effects', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_sfx: 'sword clash' }))).toContain('Sound Effect: sword clash');
    });
    it('appends background music', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_bgm: 'epic orchestral' }))).toContain('Background Music: epic orchestral');
    });
    it('adds proper separator based on trailing punctuation', () => {
        const result1 = constructVideoPrompt(baseScene({ video_prompt: 'Ends with period.', audio_sfx: 'boom' }));
        expect(result1).toContain('. Sound Effect');
        expect(result1).not.toContain('.. ');

        const result2 = constructVideoPrompt(baseScene({ video_prompt: 'No trailing punctuation', audio_sfx: 'boom' }));
        expect(result2).toContain('punctuation. Sound Effect');
    });
    it('handles empty scene gracefully', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: undefined, visual_desc: '' }))).toBe('');
    });
});

// ════════════════════════════════════════════
// submitVideoGeneration & pollVideoStatus
// ════════════════════════════════════════════
describe('submitVideoGeneration', () => {
    it('cleans model name from config (splits by colon)', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'veo3.1-components:auto' });
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_123' }
        } as any);

        try {
            const scene = baseScene({ id: 'S01', isStartEndFrameMode: false });
            const result = await submitVideoGeneration('https://example.com/img.png', scene, '16:9', []);
            
            expect(spy).toHaveBeenCalled();
            const callArgs = spy.mock.calls[0][0];
            expect(callArgs.model).toBe('veo3.1-components');
            expect(result.taskId).toBe('op_123');
        } finally {
            spy.mockRestore();
        }
    });

    it('cleans model name from scene (splits by colon)', async () => {
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_456' }
        } as any);

        try {
            const scene = baseScene({ id: 'S01', isStartEndFrameMode: true, videoModel: 'veo3.1:start_end_frame' });
            const result = await submitVideoGeneration('https://example.com/img.png', scene, '16:9', []);
            
            expect(spy).toHaveBeenCalled();
            const callArgs = spy.mock.calls[0][0];
            expect(callArgs.model).toBe('veo3.1');
        } finally {
            spy.mockRestore();
        }
    });

    it('throws error when traditional model is used with video reference assets', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'veo3.1-components' });
        const scene = baseScene({ id: 'S01', isStartEndFrameMode: false });
        const videoAsset: Asset = { id: 'ref_vid', name: '参考视频', type: 'item', refVideoUrl: 'https://cdn.com/vid.mp4' } as any;

        await expect(submitVideoGeneration('https://example.com/img.png', scene, '16:9', [videoAsset]))
            .rejects.toThrow(/模型不匹配：您当前选择的传统模型不支持/);
    });

    it('replaces tags with aliases for Seedance models', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'seedance-v2' });
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_789' }
        } as any);

        const scene = baseScene({ id: 'S01', visual_desc: '[@图像_岑矜#hero] 走进大殿' });
        const heroAsset: Asset = { id: 'hero', name: '岑矜', type: 'character', refImageUrl: 'https://example.com/hero.png' } as any;

        console.log(`[TEST DEBUG] getConfig in test:`, JSON.stringify(getModelManager().getConfig()));
        await submitVideoGeneration('https://example.com/img.png', scene, '16:9', [heroAsset]);

        expect(spy).toHaveBeenCalled();
        const callArgs = spy.mock.calls[0][0];
        expect(callArgs.model).toBe('seedance-v2');
        expect(callArgs.prompt).toContain('图片1是 [Character A]');
        expect(callArgs.prompt).toContain('[Character A] 走进大殿');
        spy.mockRestore();
    });

    it('clips prompts to 800 chars for non-Seedance and 2000 chars for Seedance', async () => {
        const longPrompt = 'A'.repeat(3000);
        
        // Non-Seedance
        getModelManager().setConfig({ t8starVideoModel: 'veo3.1-components' });
        let spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({ operation: { id: 'op_long1' } } as any);
        await submitVideoGeneration('https://example.com/img.png', baseScene({ visual_desc: longPrompt }), '16:9', []);
        expect(spy.mock.calls[0][0].prompt.length).toBe(800);
        spy.mockRestore();

        // Seedance
        getModelManager().setConfig({ t8starVideoModel: 'seedance-v2' });
        spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({ operation: { id: 'op_long2' } } as any);
        await submitVideoGeneration('https://example.com/img.png', baseScene({ visual_desc: longPrompt }), '16:9', []);
        expect(spy.mock.calls[0][0].prompt.length).toBe(2000);
        spy.mockRestore();
    });

    it('extracts start and end frames correctly when isStartEndFrameMode is true', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'seedance-v2' });
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_se' }
        } as any);

        const scene = baseScene({
            id: 'S01',
            isStartEndFrameMode: true,
            startEndAssetIds: ['first_id', 'end_id']
        });
        const assets: Asset[] = [
            { id: 'end_id', name: '尾帧图', type: 'item', refImageUrl: 'https://example.com/end.png' } as any
        ];

        await submitVideoGeneration('https://example.com/start.png', scene, '16:9', assets);

        expect(spy).toHaveBeenCalled();
        const callArgs = spy.mock.calls[0][0];
        expect(callArgs.config.images).toEqual([
            'https://example.com/start.png',
            'https://example.com/end.png'
        ]);
        expect(callArgs.config.seedanceContent).toEqual([
            { type: 'image_url', image_url: { url: 'https://example.com/start.png' }, role: 'first_frame' },
            { type: 'image_url', image_url: { url: 'https://example.com/end.png' }, role: 'last_frame' }
        ]);
        spy.mockRestore();
    });

    it('uses optionId prompt when optionId is provided', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'veo3.1-components' });
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_opt' }
        } as any);

        const scene = baseScene({
            id: 'S01',
            video_prompt: 'Default Prompt',
            prompt_options: [
                { option_id: 'A', video_prompt: 'Option A Prompt' },
                { option_id: 'B', video_prompt: 'Option B Prompt' }
            ]
        } as any);

        await submitVideoGeneration('https://example.com/img.png', scene, '16:9', [], undefined, [], 'B');

        expect(spy).toHaveBeenCalled();
        const callArgs = spy.mock.calls[0][0];
        expect(callArgs.prompt).toBe('Option B Prompt');
        spy.mockRestore();
    });

    it('deduplicates input assets by ID', async () => {
        getModelManager().setConfig({ t8starVideoModel: 'seedance-v2' });
        const spy = vi.spyOn(ai.models, 'generateVideos').mockResolvedValue({
            operation: { id: 'op_dedup' }
        } as any);

        const asset1: Asset = { id: 'hero', name: '岑矜', type: 'character', refImageUrl: 'https://example.com/hero.png' } as any;
        const asset2: Asset = { id: 'hero', name: '岑矜', type: 'character', refImageUrl: 'https://example.com/hero.png' } as any;

        const scene = baseScene({ id: 'S01', visual_desc: '[@图像_岑矜#hero] 走进大殿' });
        await submitVideoGeneration('https://example.com/img.png', scene, '16:9', [asset1, asset2]);

        expect(spy).toHaveBeenCalled();
        const callArgs = spy.mock.calls[0][0];
        expect(callArgs.config.images).toEqual(['https://example.com/hero.png']);
        spy.mockRestore();
    });
});

describe('pollVideoStatus', () => {
    it('returns done: false if operation is not done', async () => {
        const spy = vi.spyOn(ai.operations, 'getVideosOperation').mockResolvedValue({
            done: false
        } as any);

        const result = await pollVideoStatus({ id: 'op_123' });
        expect(result).toEqual({ done: false });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('returns done: true with url if operation succeeds', async () => {
        const spy = vi.spyOn(ai.operations, 'getVideosOperation').mockResolvedValue({
            done: true,
            response: {
                generatedVideos: [{
                    video: { uri: 'https://cdn.com/output.mp4' }
                }]
            }
        } as any);

        const result = await pollVideoStatus({ id: 'op_123' });
        expect(result).toEqual({ done: true, url: 'https://cdn.com/output.mp4' });
        spy.mockRestore();
    });

    it('returns done: true with error if operation has error', async () => {
        const spy = vi.spyOn(ai.operations, 'getVideosOperation').mockResolvedValue({
            error: 'AI service overload'
        } as any);

        const result = await pollVideoStatus({ id: 'op_123' });
        expect(result).toEqual({ done: true, error: 'AI service overload' });
        spy.mockRestore();
    });
});

describe('parseMaxDurationFromPrompt', () => {
    it('returns 8 for empty prompt', () => {
        expect(parseMaxDurationFromPrompt('')).toBe(8);
    });

    it('extracts duration from 0-6s pattern', () => {
        expect(parseMaxDurationFromPrompt('0-6s:岑矜走进大殿')).toBe(6);
    });

    it('extracts duration from 3-8秒 pattern', () => {
        expect(parseMaxDurationFromPrompt('3-8秒: 沈璃转身')).toBe(8);
    });

    it('extracts maximum duration when multiple tags are present', () => {
        expect(parseMaxDurationFromPrompt('0-4s:岑矜。 4-10 seconds:大殿。')).toBe(10);
    });

    it('clamps duration between 2 and 15 seconds', () => {
        expect(parseMaxDurationFromPrompt('0-1s: 闪现')).toBe(2);
        expect(parseMaxDurationFromPrompt('0-20s: 极长镜头')).toBe(15);
    });

    it('ignores single duration notations like 10s shirt', () => {
        expect(parseMaxDurationFromPrompt('岑矜 dressed in 10s shirt')).toBe(8);
    });
});
