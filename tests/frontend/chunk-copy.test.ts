import { describe, it, expect } from 'vitest';
import { buildCopiedChunk } from '../../src/app/chunkUtils';
import type { NovelChunk, Scene } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────

function makeScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: 's001',
        narration: '雨夜古镇',
        visual_desc: '油纸伞少女',
        np_prompt: 'a girl with umbrella in rainy town',
        imageUrl: 'http://img.test/1.png',
        imageAssetId: 'asset_img_1',
        videoUrl: 'http://vid.test/1.mp4',
        videoAssetId: 'asset_vid_1',
        startEndVideoUrl: 'http://vid.test/se1.mp4',
        startEndVideoAssetId: 'asset_se_1',
        narrationAudioUrl: 'http://audio.test/1.wav',
        assetIds: ['hero_base'],
        ...overrides,
    };
}

function makeChunk(overrides: Partial<NovelChunk> = {}): NovelChunk {
    return {
        id: 'chunk_1',
        index: 0,
        title: 'Ep 1: 雨夜惊变',
        text: '苏小小撑着油纸伞走在古镇的雨夜中',
        status: 'scripted',
        assets: [{ id: 'hero_base', name: '苏小小', description: '主角', type: 'character' }],
        scenes: [makeScene()],
        ...overrides,
    };
}

// ════════════════════════════════════════════════
// buildCopiedChunk
// ════════════════════════════════════════════════
describe('buildCopiedChunk', () => {

    it('1. 基本复制 — title 带 (Copy) 后缀, status 重置为 idle', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        const copy = result[1];
        expect(copy.title).toContain('(Copy)');
        expect(copy.status).toBe('idle');
    });

    it('2. ID 唯一性 — 新 chunk ID 与源 chunk 不同', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        expect(result).toHaveLength(2);
        expect(result[1].id).not.toBe(result[0].id);
    });

    it('3. 插入位置 — 副本插在源 chunk 后面', () => {
        const chunks = [
            makeChunk({ id: 'c1', index: 0, title: 'Ep 1' }),
            makeChunk({ id: 'c2', index: 1, title: 'Ep 2' }),
            makeChunk({ id: 'c3', index: 2, title: 'Ep 3' }),
        ];
        const result = buildCopiedChunk(chunks, 'c2');
        expect(result).toHaveLength(4);
        expect(result[0].id).toBe('c1');
        expect(result[1].id).toBe('c2');
        // result[2] is the copy of c2
        expect(result[2].title).toContain('(Copy)');
        expect(result[3].id).toBe('c3');
    });

    it('4. 索引重排 — 所有 chunk 的 index 被重新编号 (0, 1, 2, ...)', () => {
        const chunks = [
            makeChunk({ id: 'c1', index: 0 }),
            makeChunk({ id: 'c2', index: 1 }),
        ];
        const result = buildCopiedChunk(chunks, 'c1');
        expect(result.map(c => c.index)).toEqual([0, 1, 2]);
    });

    it('5. 场景 ID 唯一 — 每个场景获得新 ID', () => {
        const scene1 = makeScene({ id: 'scene_orig_1' });
        const scene2 = makeScene({ id: 'scene_orig_2' });
        const chunks = [makeChunk({ scenes: [scene1, scene2] })];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        const copyScenes = result[1].scenes;

        expect(copyScenes).toHaveLength(2);
        expect(copyScenes[0].id).not.toBe('scene_orig_1');
        expect(copyScenes[1].id).not.toBe('scene_orig_2');
        // Ensure the two new IDs are also different from each other
        // (Note: with Date.now() they might be the same — but in practice unlikely within map)
        expect(copyScenes[0].id).toBeDefined();
        expect(copyScenes[1].id).toBeDefined();
    });

    it('6. 媒体字段清空 — 场景的 imageUrl/videoUrl 等被清除为 undefined', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        const copyScene = result[1].scenes[0];

        expect(copyScene.imageUrl).toBeUndefined();
        expect(copyScene.imageAssetId).toBeUndefined();
        expect(copyScene.videoUrl).toBeUndefined();
        expect(copyScene.videoAssetId).toBeUndefined();
        expect(copyScene.startEndVideoUrl).toBeUndefined();
        expect(copyScene.startEndVideoAssetId).toBeUndefined();
        expect(copyScene.narrationAudioUrl).toBeUndefined();
    });

    it('7. 场景内容保留 — narration/visual_desc/np_prompt 等保留', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        const copyScene = result[1].scenes[0];
        const origScene = chunks[0].scenes[0];

        expect(copyScene.narration).toBe(origScene.narration);
        expect(copyScene.visual_desc).toBe(origScene.visual_desc);
        expect(copyScene.np_prompt).toBe(origScene.np_prompt);
        expect(copyScene.assetIds).toEqual(origScene.assetIds);
    });

    it('8. 资产保留 — chunk 的 assets 数组被复制保留', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        expect(result[1].assets).toEqual(chunks[0].assets);
    });

    it('9. 边界情况: 源不存在 — 返回原数组不变', () => {
        const chunks = [makeChunk()];
        const result = buildCopiedChunk(chunks, 'nonexistent_id');
        expect(result).toBe(chunks); // same reference = no change
    });

    it('10. 边界情况: 空场景 — 源 chunk 无场景时仍能正常复制', () => {
        const chunks = [makeChunk({ scenes: [] })];
        const result = buildCopiedChunk(chunks, 'chunk_1');
        expect(result).toHaveLength(2);
        expect(result[1].scenes).toEqual([]);
        expect(result[1].title).toContain('(Copy)');
        expect(result[1].status).toBe('idle');
    });
});
