import { describe, it, expect } from 'vitest';
import { PROMPTS } from '../../server/src/domain/generation/prompt';
import { Asset } from '../../server/src/shared/types';

// Helper: create mock assets
function createMockAssets(count: number): Asset[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `asset_${i}`,
        name: `Asset ${i}`,
        description: `Description for asset ${i}`,
        type: 'character' as const,
        imageUrl: '',
    }));
}

describe('PROMPTS', () => {
    // --- Basic string return tests ---

    describe('AGENT_A_DNA', () => {
        it('should return a non-empty string', () => {
            const result = PROMPTS.AGENT_A_DNA('Cyberpunk', 'Neon Glow', 'Chinese');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include the language and style references', () => {
            const result = PROMPTS.AGENT_A_DNA('Oil Painting', 'Rough', 'English');
            expect(result).toContain('Oil Painting');
            expect(result).toContain('Rough');
            expect(result).toContain('English');
        });

        it('should include shared Visual DNA rules', () => {
            const result = PROMPTS.AGENT_A_DNA('test', 'test', 'Chinese');
            expect(result).toContain('[Art Medium]');
            expect(result).toContain('[Era Style]');
            expect(result).toContain('visual_dna');
        });
    });

    describe('VISUAL_DNA_FROM_IMAGES', () => {
        it('should return a non-empty string', () => {
            const result = PROMPTS.VISUAL_DNA_FROM_IMAGES('Chinese');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include the same Visual DNA rules as AGENT_A_DNA', () => {
            const dnaResult = PROMPTS.AGENT_A_DNA('test', 'test', 'Chinese');
            const imageResult = PROMPTS.VISUAL_DNA_FROM_IMAGES('Chinese');
            // Both should contain the shared rule markers
            expect(dnaResult).toContain('[Art Medium]');
            expect(imageResult).toContain('[Art Medium]');
            expect(dnaResult).toContain('visual_dna');
            expect(imageResult).toContain('visual_dna');
        });
    });

    // --- Asset prompt tests ---

    describe('AGENT_A_ASSET', () => {
        it('should return a non-empty string with empty assets', () => {
            const result = PROMPTS.AGENT_A_ASSET('Chinese', []);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include shared asset description rules', () => {
            const result = PROMPTS.AGENT_A_ASSET('Chinese', []);
            expect(result).toContain('character');
            expect(result).toContain('item');
            expect(result).toContain('location');
        });

        it('should include 1:1还原 when useOriginalCharacters is true', () => {
            const result = PROMPTS.AGENT_A_ASSET('Chinese', [], 'Conan', true);
            expect(result).toContain('1:1');
            expect(result).toContain('Conan');
        });

        it('should NOT include 1:1还原 when useOriginalCharacters is false', () => {
            const result = PROMPTS.AGENT_A_ASSET('Chinese', [], 'Conan', false);
            expect(result).not.toContain('1:1还原');
        });

        it('should truncate assets to 50', () => {
            const manyAssets = createMockAssets(100);
            const result = PROMPTS.AGENT_A_ASSET('Chinese', manyAssets);
            // Should contain asset_0 but not asset_50
            expect(result).toContain('asset_0');
            expect(result).toContain('asset_49');
            expect(result).not.toContain('asset_50');
        });
    });

    describe('AGENT_A2_FROM_BEATS', () => {
        it('should return a non-empty string with empty assets', () => {
            const result = PROMPTS.AGENT_A2_FROM_BEATS('Chinese', []);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include shared asset description rules', () => {
            const result = PROMPTS.AGENT_A2_FROM_BEATS('Chinese', []);
            expect(result).toContain('character');
            expect(result).toContain('item');
            expect(result).toContain('location');
        });

        it('should include 1:1还原 when useOriginalCharacters is true', () => {
            const result = PROMPTS.AGENT_A2_FROM_BEATS('Chinese', [], 'Harry Potter', true);
            expect(result).toContain('1:1');
            expect(result).toContain('Harry Potter');
        });

        it('should truncate assets to 50', () => {
            const manyAssets = createMockAssets(100);
            const result = PROMPTS.AGENT_A2_FROM_BEATS('Chinese', manyAssets);
            expect(result).toContain('asset_49');
            expect(result).not.toContain('asset_50');
        });
    });

    // --- Agent prompt tests ---

    describe('AGENT_1_NARRATIVE', () => {
        const baseConfig = {
            batchInstruction: 'Generate 3 episodes',
            language: 'Chinese',
            text: 'Test novel text',
            prevContext: '',
            isBatched: false,
            episodeRange: 'Episodes 1-3',
            currentBatchNum: 1,
            totalBatches: 1,
        };

        it('should return a non-empty string', () => {
            const result = PROMPTS.AGENT_1_NARRATIVE(baseConfig);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include language and text', () => {
            const result = PROMPTS.AGENT_1_NARRATIVE(baseConfig);
            expect(result).toContain('Chinese');
            expect(result).toContain('Test novel text');
        });

        it('should include batch info when batched', () => {
            const result = PROMPTS.AGENT_1_NARRATIVE({ ...baseConfig, isBatched: true, episodeRange: 'Episodes 1-3' });
            expect(result).toContain('Episodes 1-3');
        });
    });

    describe('AGENT_2_ANNOTATE', () => {
        it('should return a non-empty string', () => {
            const result = PROMPTS.AGENT_2_ANNOTATE('Chinese', 'lens_library_data', 'visual_dna', 'narrative_context');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include lens library data', () => {
            const result = PROMPTS.AGENT_2_ANNOTATE('Chinese', 'LENS_LIBRARY_CONTENT', 'visual_dna', 'narrative_context');
            expect(result).toContain('LENS_LIBRARY_CONTENT');
        });

        it('should include visual DNA and narrative context', () => {
            const result = PROMPTS.AGENT_2_ANNOTATE('Chinese', 'lens', 'VISUAL_DNA_TAGS', 'NARRATIVE_CTX_DATA');
            expect(result).toContain('VISUAL_DNA_TAGS');
            expect(result).toContain('NARRATIVE_CTX_DATA');
        });
    });

    describe('AGENT_3_ASSET_PRODUCER', () => {
        it('should return a non-empty string', () => {
            const result = PROMPTS.AGENT_3_ASSET_PRODUCER('lens_data', 'Chinese', '[Style Prefix]', 'asset_map_data');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should include style prefix and asset map', () => {
            const result = PROMPTS.AGENT_3_ASSET_PRODUCER('lens', 'Chinese', 'MY_STYLE_PREFIX', 'MY_ASSET_MAP');
            expect(result).toContain('MY_STYLE_PREFIX');
            expect(result).toContain('MY_ASSET_MAP');
        });
    });
});
