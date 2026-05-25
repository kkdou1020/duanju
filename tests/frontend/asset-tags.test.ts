import { describe, it, expect, beforeEach } from 'vitest';
import {
    extractAssetTags,
    isStoryboardTag,
    extractDisplayTags,
    bestMatchAsset,
    resolveTagToAsset,
    injectTagIds,
    stripAssetTags,
} from '../../src/shared/asset-tags';

// ─── Test Fixtures ───
const CANDIDATES = [
    { name: '岑矜', id: 'hero_base' },
    { name: '沈璃', id: 'heroine_base' },
    { name: '岑矜的卧室', id: 'scene_bedroom' },
    { name: '大殿', id: 'scene_hall' },
];

// ────────────────────────────────────────────
// extractAssetTags
// ────────────────────────────────────────────
describe('extractAssetTags', () => {
    it('extracts a single tag without anchor', () => {
        const tags = extractAssetTags('这是一段描述 @图像_岑矜 的画面');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toEqual({ raw: '@图像_岑矜', name: '岑矜', id: undefined });
    });

    it('extracts a tag with #id anchor', () => {
        const tags = extractAssetTags('参考 @图像_岑矜#hero_base 生成');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toEqual({ raw: '@图像_岑矜#hero_base', name: '岑矜', id: 'hero_base' });
    });

    it('extracts multiple tags', () => {
        const tags = extractAssetTags('@图像_岑矜 和 @图像_沈璃#heroine_base 在 @图像_大殿');
        expect(tags).toHaveLength(3);
        expect(tags[0].name).toBe('岑矜');
        expect(tags[1].name).toBe('沈璃');
        expect(tags[1].id).toBe('heroine_base');
        expect(tags[2].name).toBe('大殿');
    });

    it('returns empty for text with no tags', () => {
        expect(extractAssetTags('普通文本没有标签')).toHaveLength(0);
    });

    it('stops at Chinese punctuation boundaries', () => {
        const tags = extractAssetTags('@图像_岑矜，正在走路');
        expect(tags).toHaveLength(1);
        expect(tags[0].name).toBe('岑矜');
    });

    it('stops at parentheses', () => {
        const tags = extractAssetTags('(@图像_岑矜)');
        expect(tags).toHaveLength(1);
        expect(tags[0].name).toBe('岑矜');
    });

    it('handles tag with underscore in name', () => {
        const tags = extractAssetTags('@图像_分镜S05');
        expect(tags).toHaveLength(1);
        expect(tags[0].name).toBe('分镜S05');
    });

    it('handles consecutive tags without separator', () => {
        const tags = extractAssetTags('@图像_岑矜 @图像_沈璃');
        expect(tags).toHaveLength(2);
    });
});

// ────────────────────────────────────────────
// isStoryboardTag
// ────────────────────────────────────────────
describe('isStoryboardTag', () => {
    it('matches 分镜S01', () => { expect(isStoryboardTag('分镜S01')).toBe(true); });
    it('matches 分镜S99', () => { expect(isStoryboardTag('分镜S99')).toBe(true); });
    it('matches 分镜E1_S01 (episode prefix)', () => { expect(isStoryboardTag('分镜E1_S01')).toBe(true); });
    it('matches 分镜E12_S05', () => { expect(isStoryboardTag('分镜E12_S05')).toBe(true); });
    it('matches with suffix like -A', () => { expect(isStoryboardTag('分镜E1_S01-A')).toBe(true); });
    it('matches with suffix like -B2', () => { expect(isStoryboardTag('分镜S01-B2')).toBe(true); });
    it('rejects regular names', () => {
        expect(isStoryboardTag('岑矜')).toBe(false);
        expect(isStoryboardTag('大殿')).toBe(false);
    });
    it('rejects partial storyboard patterns', () => {
        expect(isStoryboardTag('分镜')).toBe(false);
        expect(isStoryboardTag('分镜E1')).toBe(false);
        expect(isStoryboardTag('S01')).toBe(false);
    });
});

// ────────────────────────────────────────────
// extractDisplayTags
// ────────────────────────────────────────────
describe('extractDisplayTags', () => {
    it('returns display names, excluding storyboard tags', () => {
        const names = extractDisplayTags('@图像_岑矜 参考 @图像_分镜S05 和 @图像_沈璃');
        expect(names).toEqual(['岑矜', '沈璃']);
    });
    it('returns empty for no tags', () => { expect(extractDisplayTags('没有标签')).toEqual([]); });
    it('returns empty when only storyboard tags', () => { expect(extractDisplayTags('@图像_分镜S01 @图像_分镜E1_S03')).toEqual([]); });
});

// ────────────────────────────────────────────
// bestMatchAsset
// ────────────────────────────────────────────
describe('bestMatchAsset', () => {
    it('Tier 1: exact name match', () => { expect(bestMatchAsset('岑矜', CANDIDATES)).toEqual({ name: '岑矜', id: 'hero_base' }); });
    it('Tier 1: exact ID match', () => { expect(bestMatchAsset('hero_base', CANDIDATES)).toEqual({ name: '岑矜', id: 'hero_base' }); });
    it('Tier 2: trimmed match', () => { expect(bestMatchAsset('  岑矜  ', CANDIDATES)).toEqual({ name: '岑矜', id: 'hero_base' }); });
    it('Tier 3: prefix match picks longest matching candidate', () => {
        const result = bestMatchAsset('岑矜的', CANDIDATES);
        expect(result).toEqual({ name: '岑矜的卧室', id: 'scene_bedroom' });
    });
    it('Tier 3: prefix match with short tagName', () => {
        const shortCandidates = [{ name: '岑矜', id: 'hero_base' }];
        expect(bestMatchAsset('岑矜的', shortCandidates)).toEqual({ name: '岑矜', id: 'hero_base' });
    });
    it('Tier 3: prefers longest match', () => {
        expect(bestMatchAsset('岑矜的卧室里', CANDIDATES)).toEqual({ name: '岑矜的卧室', id: 'scene_bedroom' });
    });
    it('returns undefined when no match', () => { expect(bestMatchAsset('完全不存在的角色', CANDIDATES)).toBeUndefined(); });
    it('returns undefined for empty candidates', () => { expect(bestMatchAsset('岑矜', [])).toBeUndefined(); });
    it('Tier 3: rejects overlap below 50%', () => { expect(bestMatchAsset('岑矜是一个很长的名字', CANDIDATES)).toBeUndefined(); });
});

// ────────────────────────────────────────────
// resolveTagToAsset
// ────────────────────────────────────────────
describe('resolveTagToAsset', () => {
    it('with #id → exact ID lookup', () => { expect(resolveTagToAsset({ name: '随便什么名字', id: 'hero_base' }, CANDIDATES)).toEqual({ name: '岑矜', id: 'hero_base' }); });
    it('with #id → undefined when ID not found', () => { expect(resolveTagToAsset({ name: '岑矜', id: 'nonexistent' }, CANDIDATES)).toBeUndefined(); });
    it('without #id → falls back to bestMatchAsset', () => { expect(resolveTagToAsset({ name: '岑矜' }, CANDIDATES)).toEqual({ name: '岑矜', id: 'hero_base' }); });
});

// ────────────────────────────────────────────
// injectTagIds
// ────────────────────────────────────────────
describe('injectTagIds', () => {
    it('adds #id to tags that match assets', () => { expect(injectTagIds('参考 @图像_岑矜 生成', CANDIDATES)).toBe('参考 [@图像_岑矜#hero_base] 生成'); });
    it('preserves existing #id anchors', () => { expect(injectTagIds('@图像_岑矜#hero_base', CANDIDATES)).toBe('[@图像_岑矜#hero_base]'); });
    it('skips storyboard tags', () => { expect(injectTagIds('@图像_分镜S05', CANDIDATES)).toBe('[@图像_分镜S05]'); });
    it('leaves unmatched tags unchanged', () => { expect(injectTagIds('@图像_不存在的人', CANDIDATES)).toBe('@图像_不存在的人'); });
    it('handles empty string', () => { expect(injectTagIds('', CANDIDATES)).toBe(''); });
    it('handles multiple mixed tags', () => {
        const text = '@图像_岑矜 和 @图像_沈璃#heroine_base 和 @图像_分镜S01';
        expect(injectTagIds(text, CANDIDATES)).toBe('[@图像_岑矜#hero_base] 和 [@图像_沈璃#heroine_base] 和 [@图像_分镜S01]');
    });
});

// ────────────────────────────────────────────
// stripAssetTags
// ────────────────────────────────────────────
describe('stripAssetTags', () => {
    it('removes tags and collapses whitespace', () => { expect(stripAssetTags('前面 @图像_岑矜 后面')).toBe('前面 岑矜 后面'); });
    it('removes tags with #id anchors', () => { expect(stripAssetTags('前面 @图像_岑矜#hero_base 后面')).toBe('前面 岑矜 后面'); });
    it('removes multiple tags', () => { expect(stripAssetTags('@图像_岑矜 和 @图像_沈璃 在大殿')).toBe('岑矜 和 沈璃 在大殿'); });
    it('handles text with no tags', () => { expect(stripAssetTags('没有标签的文本')).toBe('没有标签的文本'); });
    it('handles text that is only a tag', () => { expect(stripAssetTags('@图像_岑矜')).toBe('岑矜'); });
});
