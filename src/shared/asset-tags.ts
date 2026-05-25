/**
 * Shared @图像 tag utilities — single source of truth for tag parsing & matching.
 *
 * Tag format:  [@图像_显示名#asset_id]   (brackets provide unambiguous boundary)
 * Legacy:      @图像_显示名#asset_id     (still supported without brackets)
 * Examples:    [@图像_岑矜#hero_base]    [@图像_分镜S05]    @图像_岑矜的卧室
 */

/** Unified regex: supports new bracket syntax with spaces/parens, and legacy syntax (both supporting hyphenated IDs) */
export const ASSET_TAG_REGEX = /\[@图像_([^\]#]+)(?:#([a-zA-Z0-9_\-]+))?\]|@图像_([^\s，。,.;；：:！!？?、）)｝}\]\[（(｛{@#]+)(?:#([a-zA-Z0-9_\-]+))?/g;

export interface ParsedTag {
    /** Full match text (e.g. "@图像_岑矜#hero_base") */
    raw: string;
    /** Display name (e.g. "岑矜") */
    name: string;
    /** Optional asset ID anchor (e.g. "hero_base"), undefined for legacy tags */
    id?: string;
}

/** Extract all @图像 tags from text */
export function extractAssetTags(text: string): ParsedTag[] {
    return [...text.matchAll(ASSET_TAG_REGEX)].map(m => ({
        raw: m[0],
        name: m[1] || m[3],
        id: m[2] || m[4] || undefined,
    }));
}

/** Check if a tag name is a storyboard reference (分镜S01, 分镜E1_S01, 分镜E1_S01-A, 分镜E1_S01_copy, etc.) */
export function isStoryboardTag(name: string): boolean {
    return /^分镜(E\d+_)?S\d+(?:[-_][a-zA-Z0-9]+)*(?:视频|video)?$/.test(name);
}

/** Extract tag display names, excluding 分镜 tags */
export const extractDisplayTags = (text: string): string[] => {
    return extractAssetTags(text).map(t => t.name).filter(n => !isStoryboardTag(n));
}

/**
 * Best-match an asset by tag name: exact → trimmed → longest startsWith.
 * This is the "correct" 3-Tier logic from agent3-asset.ts.
 */
export function bestMatchAsset<T extends { name: string; id: string }>(
    tagName: string,
    candidates: T[]
): T | undefined {
    // Tier 1: Exact match (name or ID)
    const exact = candidates.find(a => a.name === tagName || a.id === tagName);
    if (exact) return exact;

    // Tier 2: Trimmed match
    const trimmed = tagName.trim();
    if (trimmed !== tagName) {
        const trimMatch = candidates.find(a => a.name === trimmed || a.id === trimmed);
        if (trimMatch) return trimMatch;
    }

    // Tier 3: Longest prefix match with overlap ratio gate (≥50%)
    let best: T | undefined;
    for (const a of candidates) {
        if (a.name.length >= 2 && (tagName.startsWith(a.name) || a.name.startsWith(tagName))) {
            const overlap = Math.min(a.name.length, tagName.length) / Math.max(a.name.length, tagName.length);
            if (overlap >= 0.5 && (!best || a.name.length > best.name.length)) {
                best = a;
            }
        }
    }
    return best;
}

/**
 * Resolve a parsed tag to an asset.
 * - If tag has #id anchor → exact ID lookup (zero ambiguity)
 * - Otherwise → fall back to bestMatchAsset by name
 */
export function resolveTagToAsset<T extends { name: string; id: string }>(
    tag: { name: string; id?: string },
    candidates: T[]
): T | undefined {
    if (tag.id) {
        return candidates.find(a => a.id === tag.id);
    }
    return bestMatchAsset(tag.name, candidates);
}

/**
 * Rewrite @图像 tags in text to include #id anchors.
 * Existing anchors are preserved; 分镜 tags are skipped.
 */
export function injectTagIds<T extends { name: string; id: string }>(
    text: string,
    candidates: T[]
): string {
    if (!text) return text;
    return text.replace(ASSET_TAG_REGEX, (match, p1, p2, p3, p4) => {
        const tagName = p1 || p3;
        const existingId = p2 || p4;
        if (isStoryboardTag(tagName)) return match.startsWith('[') ? match : `[@图像_${tagName}]`;
        if (existingId) return match.startsWith('[') ? match : `[@图像_${tagName}#${existingId}]`;
        const asset = bestMatchAsset(tagName, candidates);
        return asset ? `[@图像_${tagName}#${asset.id}]` : match;
    });
}

/**
 * Strip all @图像 tags from text (for sending to models that don't understand them).
 * Extracts the display name from the tag to preserve sentence structure instead of leaving empty holes.
 */
export function stripAssetTags(text: string): string {
    return text
        .replace(ASSET_TAG_REGEX, (match, p1, p2, p3, p4) => {
            return p1 || p3 || '';
        })
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Wrap a tag in bracket format */
export function bracketTag(name: string, id?: string): string {
    return id ? `[@图像_${name}#${id}]` : `[@图像_${name}]`;
}
