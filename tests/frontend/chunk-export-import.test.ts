import { describe, it, expect } from 'vitest';
import { buildExportData, parseImportData } from '../../src/app/chunkUtils';
import type { NovelChunk, Scene, Asset } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────

function makeScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: 'E1_B1',
        narration: '雨夜古镇',
        visual_desc: '油纸伞少女',
        np_prompt: 'a girl with umbrella',
        imageUrl: 'http://img.test/1.png',
        imageAssetId: 'asset_img_1',
        videoUrl: 'http://vid.test/1.mp4',
        videoAssetId: 'asset_vid_1',
        startEndVideoUrl: 'http://vid.test/se1.mp4',
        startEndVideoAssetId: 'asset_se_1',
        narrationAudioUrl: 'http://audio.test/1.wav',
        assetIds: ['hero'],
        ...overrides,
    };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 'hero',
        name: '苏小小',
        description: '主角',
        type: 'character',
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
        assets: [makeAsset()],
        scenes: [makeScene()],
        ...overrides,
    };
}

// ════════════════════════════════════════════════
// buildExportData
// ════════════════════════════════════════════════
describe('buildExportData', () => {

    it('1. 包含 version 字段', () => {
        const data = buildExportData(makeChunk());
        expect(data.version).toBe(1);
    });

    it('2. 包含 title', () => {
        const data = buildExportData(makeChunk({ title: '雨夜惊变' }));
        expect(data.title).toBe('雨夜惊变');
    });

    it('3. 包含 text + assets + scenes', () => {
        const chunk = makeChunk();
        const data = buildExportData(chunk);
        expect(data.text).toBe(chunk.text);
        expect(data.assets).toEqual(chunk.assets);
        expect(data.scenes).toEqual(chunk.scenes);
    });

    it('4. 包含 beatSheet / episodeData / batchMeta', () => {
        const chunk = makeChunk() as any;
        chunk.beatSheet = { beats: [{ beat_id: 'B1' }] };
        chunk.episodeData = { episode_number: 1 };
        chunk.batchMeta = { title: 'test' };
        const data = buildExportData(chunk);
        expect(data.beatSheet).toEqual({ beats: [{ beat_id: 'B1' }] });
        expect(data.episodeData).toEqual({ episode_number: 1 });
        expect(data.batchMeta).toEqual({ title: 'test' });
    });

    it('5. 缺少的字段为 undefined 而非报错', () => {
        const data = buildExportData(makeChunk());
        expect(data.beatSheet).toBeUndefined();
        expect(data.episodeData).toBeUndefined();
        expect(data.batchMeta).toBeUndefined();
    });
});

// ════════════════════════════════════════════════
// parseImportData
// ════════════════════════════════════════════════
describe('parseImportData', () => {

    it('6. 正常解析 — 恢复 title/beatSheet/episodeData', () => {
        const input = {
            text: '测试文本',
            title: '雨夜惊变',
            scenes: [makeScene()],
            assets: [makeAsset()],
            beatSheet: { beats: [] },
            episodeData: { episode_number: 1 },
            batchMeta: { title: 'test' },
        };
        const chunk = parseImportData(input);
        expect(chunk.title).toBe('雨夜惊变');
        expect(chunk.status).toBe('scripted');
        expect(chunk.id).toContain('import');
        expect((chunk as any).beatSheet).toEqual({ beats: [] });
        expect((chunk as any).episodeData).toEqual({ episode_number: 1 });
    });

    it('7. 缺少 title — 使用默认值', () => {
        const input = { text: '测试', scenes: [] };
        const chunk = parseImportData(input);
        expect(chunk.title).toBe('Imported Chunk');
    });

    it('8. 缺少 assets — 默认空数组', () => {
        const input = { text: '测试', scenes: [] };
        const chunk = parseImportData(input);
        expect(chunk.assets).toEqual([]);
    });

    it('9. 缺少 scenes — 抛出错误', () => {
        expect(() => parseImportData({ text: '测试' })).toThrow('Invalid scenes');
    });

    it('10. 缺少 text — 抛出错误', () => {
        expect(() => parseImportData({ scenes: [] })).toThrow('Invalid text');
    });

    it('11. assets 不是数组 — 抛出错误', () => {
        expect(() => parseImportData({ text: '测试', scenes: [], assets: 'invalid' })).toThrow('Invalid assets');
    });

    it('12. 兼容旧版 (无 version) — 仍可正常解析', () => {
        const oldFormat = {
            chunkId: 'old_chunk',
            text: '旧版数据',
            scenes: [makeScene()],
            assets: [makeAsset()],
        };
        const chunk = parseImportData(oldFormat);
        expect(chunk.text).toBe('旧版数据');
        expect(chunk.title).toBe('Imported Chunk');
        expect(chunk.assets).toHaveLength(1);
    });
});
