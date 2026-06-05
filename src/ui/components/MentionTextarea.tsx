import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Asset } from '@/shared/types';
import { X } from 'lucide-react';
import { ASSET_TAG_REGEX, extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';
import { extractAudioFromVideo } from '@/shared/audio-extractor';

export interface SceneImageCandidate {
    id: string;
    name: string;
    refImageUrl?: string;
    canDelete?: boolean;
    mediaUrl?: string;
    mediaAssetId?: string;
}

interface MentionTextareaProps {
    value: string;
    onChange: (value: string) => void;
    assets: Asset[];
    sceneImages?: SceneImageCandidate[];
    videos?: SceneImageCandidate[];
    audios?: SceneImageCandidate[];
    referencedAssetIds: string[];
    onMention: (assetId: string) => void;
    onUnmention: (assetId: string) => void;
    onAssetUpload?: (type: 'video' | 'audio', file: File) => Promise<string | undefined>;
    onAssetDelete?: (assetId: string) => void;

    maxMentions?: number;
    mode?: 'video' | 'image';
    disableVideos?: boolean;
    className?: string;
    placeholder?: string;
    onBlur?: () => void;
}

// Regex for matching @图像_ tags — uses the shared unified regex
const TAG_REGEX = ASSET_TAG_REGEX;

// Extract all @图像_ tag names from text (excluding 分镜 tags)
const extractTags = (text: string): string[] => {
    return extractAssetTags(text).map(t => t.name).filter(n => !isStoryboardTag(n));
};

// Find asset info (display name + thumbnail + category) for a tag
// Uses ID anchor for exact lookup, falls back to name-based matching
const findAssetInfo = (
    tagName: string,
    assets: Asset[],
    sceneImages: SceneImageCandidate[],
    tagId?: string,
    videos: SceneImageCandidate[] = [],
    audios: SceneImageCandidate[] = []
): { displayName: string; thumb?: string; category?: string } => {
    // 0. If #id anchor is present, exact ID lookup
    if (tagId) {
        const byId = assets.find(a => a.id === tagId);
        if (byId) return { displayName: byId.name, thumb: byId.refImageUrl, category: byId.type };
        const siById = sceneImages.find(s => s.id === tagId);
        if (siById) return { displayName: siById.name, thumb: siById.refImageUrl, category: 'image' };
        const vById = videos.find(v => v.id === tagId);
        if (vById) return { displayName: vById.name, thumb: vById.refImageUrl, category: 'video' };
        const aById = audios.find(a => a.id === tagId);
        if (aById) return { displayName: aById.name, thumb: aById.refImageUrl, category: 'audio' };
    }

    // 1. Exact name match
    const exactAsset = assets.find(a => a.name === tagName || a.id === tagName);
    if (exactAsset) return { displayName: exactAsset.name, thumb: exactAsset.refImageUrl, category: exactAsset.type };
    const exactSi = sceneImages.find(s => s.name === tagName || s.id === tagName);
    if (exactSi) return { displayName: exactSi.name, thumb: exactSi.refImageUrl, category: 'image' };
    const exactV = videos.find(v => v.name === tagName || v.id === tagName);
    if (exactV) return { displayName: exactV.name, thumb: exactV.refImageUrl, category: 'video' };
    const exactA = audios.find(a => a.name === tagName || a.id === tagName);
    if (exactA) return { displayName: exactA.name, thumb: exactA.refImageUrl, category: 'audio' };

    // 1.5 Storyboard suffix matching: @图像_分镜S01 should match sceneImage named 分镜E1_S01
    if (isStoryboardTag(tagName)) {
        const beatSuffix = tagName.replace('分镜', ''); // "S01" or "E1_S01"
        const suffixMatch = sceneImages.find(s => {
            const siSuffix = s.name.replace('分镜', '');
            return siSuffix === beatSuffix || siSuffix.endsWith(`_${beatSuffix}`);
        });
        if (suffixMatch) return { displayName: suffixMatch.name, thumb: suffixMatch.refImageUrl, category: 'image' };
    }

    // 2. Longest prefix-match fallback with overlap ratio gate (≥50%)
    const allCandidates = [
        ...assets.map(a => ({ ...a, __cat: a.type })),
        ...sceneImages.map(a => ({ ...a, __cat: 'image' })),
        ...videos.map(a => ({ ...a, __cat: 'video' })),
        ...audios.map(a => ({ ...a, __cat: 'audio' }))
    ];
    let best: { displayName: string; thumb?: string; category?: string } | null = null;
    let bestLen = 0;
    for (const c of allCandidates) {
        if (c.name.length >= 2 && (c.name.startsWith(tagName) || tagName.startsWith(c.name))) {
            const overlap = Math.min(c.name.length, tagName.length) / Math.max(c.name.length, tagName.length);
            if (overlap >= 0.5 && c.name.length > bestLen) {
                bestLen = c.name.length;
                best = { displayName: c.name, thumb: 'refImageUrl' in c ? (c as any).refImageUrl : undefined, category: c.__cat };
            }
        }
    }
    if (best) return best;

    return { displayName: tagName };
};

// Color schemes per mode
const CHIP_COLORS = {
    video: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },  // blue
    image: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(169, 85, 247, 0.93)', text: '#c084fc' },  // purple
};

// Convert plain text to HTML with mention chips
const textToHtml = (
    text: string,
    assets: Asset[],
    sceneImages: SceneImageCandidate[],
    mode: 'video' | 'image' = 'video',
    videos: SceneImageCandidate[] = [],
    audios: SceneImageCandidate[] = [],
    disableVideos: boolean = false
): string => {
    if (!text) return '';
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return escaped.replace(
        TAG_REGEX,
        (_match, p1, p2, p3, p4) => {
            const tagName = p1 || p3;
            const tagId = (p2 || p4) as string | undefined;
            const info = findAssetInfo(tagName, assets, sceneImages, tagId, videos, audios);

            const isInvalidMedia = disableVideos && (info.category === 'video' || info.category === 'audio');

            const colors = isInvalidMedia
                ? { bg: 'rgba(239,68,68,0.1)', border: 'rgba(248,113,113,0.5)', text: '#ef4444' }
                : CHIP_COLORS[mode];

            const defaultEmoji = info.category === 'audio' ? '🎵' : info.category === 'video' ? '🎬' : (info.category === 'image' || info.category === 'scene' ? '🖼️' : '🧑');
            const imgHtml = info.thumb
                ? `<img src="${info.thumb}" style="width:14px;height:14px;border-radius:2px;object-fit:cover;vertical-align:-2px;margin-right:3px;display:inline-block;" />`
                : `<span style="vertical-align:-1px;margin-right:3px;display:inline-block;font-size:inherit;">${defaultEmoji}</span>`;
            // Store both name and optional id in data attributes
            const idAttr = tagId ? ` data-mention-id="${tagId}"` : '';

            const extraStyles = isInvalidMedia ? 'text-decoration:line-through;' : '';
            const titleAttr = isInvalidMedia ? ` title="当前模型不支持此类型素材，请删除"` : '';

            return `<span contenteditable="false" data-mention="${tagName}"${idAttr}${titleAttr} style="display:inline;background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;padding:1px 5px;margin:0;font-size:inherit;color:${colors.text};cursor:default;vertical-align:baseline;line-height:normal;user-select:all;font-weight:500;-webkit-box-decoration-break:clone;box-decoration-break:clone;${extraStyles}">${imgHtml}${info.displayName}</span>\u200B`;
        }
    );
};

// Extract plain text from contentEditable DOM
const htmlToText = (el: HTMLDivElement): string => {
    let result = '';
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += (node.textContent || '').replace(/\u200B/g, '');
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            // Mention chip → convert back to @图像_xxx or @图像_xxx#id
            if (elem.dataset.mention) {
                const mentionId = elem.dataset.mentionId; // data-mention-id
                result += mentionId
                    ? `[@图像_${elem.dataset.mention}#${mentionId}]`
                    : `[@图像_${elem.dataset.mention}]`;
                return; // don't recurse into chip children
            }
            // <br> → newline
            if (elem.tagName === 'BR') {
                result += '\n';
                return;
            }
            // <div> blocks (contentEditable inserts divs for newlines)
            if (elem.tagName === 'DIV' && result.length > 0 && !result.endsWith('\n')) {
                result += '\n';
            }
            for (const child of Array.from(node.childNodes)) {
                walk(child);
            }
        }
    };
    for (const child of Array.from(el.childNodes)) {
        walk(child);
    }
    return result;
};

const MentionTextarea: React.FC<MentionTextareaProps> = ({
    value,
    onChange,
    assets,
    sceneImages = [],
    videos = [],
    audios = [],
    referencedAssetIds,
    onMention,
    onUnmention,
    onAssetUpload,
    onAssetDelete,
    maxMentions,
    mode = 'video',
    disableVideos = false,
    className = '',
    placeholder = '',
    onBlur
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
    const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('up');
    const [previewImage, setPreviewImage] = useState<{ url: string; x: number; y: number } | null>(null);

    const editorRef = useRef<HTMLDivElement>(null);
    const prevTagsRef = useRef<string[]>(extractTags(value));
    const dropdownRef = useRef<HTMLDivElement>(null);
    const lastRenderedValue = useRef<string>(value);
    const isInternalChange = useRef(false);

    // Signature key generator to detect when tags resolve to thumbnails asynchronously
    const getThumbKey = (val: string, assetsList: Asset[], siList: SceneImageCandidate[], vList: SceneImageCandidate[], aList: SceneImageCandidate[]) => {
        return [...val.matchAll(TAG_REGEX)].map(m => {
            const tagName = m[1] || m[3];
            const tagId = m[2] || m[4];
            return findAssetInfo(tagName, assetsList, siList, tagId, vList, aList).thumb || '';
        }).join(',');
    };

    const lastThumbKeyRef = useRef<string>(getThumbKey(value, assets, sceneImages, videos, audios));

    const videoUploadRef = useRef<HTMLInputElement>(null);
    const audioUploadRef = useRef<HTMLInputElement>(null);
    const isUploadingRef = useRef(false);
    const isDeletingRef = useRef(false);
    const newlyUploadedIdRef = useRef<string | null>(null);
    const lastDisableVideosRef = useRef<boolean>(disableVideos);

    const availableAssets = assets; // Removed filter to allow assets without reference images

    // Sync prevTagsRef on external value changes
    useEffect(() => {
        prevTagsRef.current = extractTags(value);
    }, [value]);

    // Render HTML when value, assets, or sceneImages changes externally
    useEffect(() => {
        if (!editorRef.current) return;
        if (isInternalChange.current) {
            isInternalChange.current = false;
            return;
        }
        
        const currentThumbKey = getThumbKey(value, assets, sceneImages, videos, audios);
        const hasThumbChanged = currentThumbKey !== lastThumbKeyRef.current;

        if (value !== lastRenderedValue.current || disableVideos !== lastDisableVideosRef.current || hasThumbChanged) {
            const html = textToHtml(value, assets, sceneImages, mode as 'video' | 'image', videos, audios, disableVideos);
            editorRef.current.innerHTML = html || '';
            lastRenderedValue.current = value;
            lastDisableVideosRef.current = disableVideos;
            lastThumbKeyRef.current = currentThumbKey;
        }
    }, [value, assets, sceneImages, videos, audios, mode, disableVideos]);

    // Initial render
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML) {
            editorRef.current.innerHTML = textToHtml(value, assets, sceneImages, mode as 'video' | 'image', videos, audios, disableVideos) || '';
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Build candidate list
    const candidates = React.useMemo(() => {
        const items: { id: string; name: string; displayName: string; disabled: boolean; inPrompt: boolean; thumb?: string; category: 'asset' | 'scene' | 'video' | 'audio', canDelete?: boolean, mediaUrl?: string, mediaAssetId?: string }[] = [];

        // Deduplicate incoming lists to prevent duplicate keys in lists
        const uniqueAssetsMap = new Map<string, Asset>();
        (availableAssets || []).forEach(a => { if (a && a.id) uniqueAssetsMap.set(a.id, a); });
        const deduplicatedAssets = Array.from(uniqueAssetsMap.values());

        const uniqueSceneImagesMap = new Map<string, any>();
        (sceneImages || []).forEach(si => { if (si && si.id) uniqueSceneImagesMap.set(si.id, si); });
        const deduplicatedSceneImages = Array.from(uniqueSceneImagesMap.values());

        const uniqueVideosMap = new Map<string, any>();
        (videos || []).forEach(v => { if (v && v.id) uniqueVideosMap.set(v.id, v); });
        const deduplicatedVideos = Array.from(uniqueVideosMap.values());

        const uniqueAudiosMap = new Map<string, any>();
        (audios || []).forEach(a => { if (a && a.id) uniqueAudiosMap.set(a.id, a); });
        const deduplicatedAudios = Array.from(uniqueAudiosMap.values());

        // Count ALL unique @图像 tags in prompt (including 分镜 tags)
        const currentTagMatches = [...value.matchAll(TAG_REGEX)];
        const promptIdSet = new Set<string>();
        const promptNameSet = new Set<string>();
        const uniqueRefs = new Set<string>();
        for (const m of currentTagMatches) {
            const tagName = m[1] || m[3];
            const tagId = m[2] || m[4]; // #id anchor
            if (tagId) promptIdSet.add(tagId);
            promptNameSet.add(tagName);
            // Use #id as unique key when available, otherwise name (avoids double-counting)
            uniqueRefs.add(tagId || tagName);
        }
        const currentMentionCount = uniqueRefs.size;
        const atLimit = maxMentions !== undefined && currentMentionCount >= maxMentions;

        const videoIds = new Set(deduplicatedVideos.map(v => v.id));
        const audioIds = new Set(deduplicatedAudios.map(a => a.id));
        const sceneImageIds = new Set(deduplicatedSceneImages.map(s => s.id));

        for (const asset of deduplicatedAssets) {
            if (videoIds.has(asset.id) || audioIds.has(asset.id) || sceneImageIds.has(asset.id)) {
                continue;
            }
            const isInPrompt = promptIdSet.has(asset.id) || promptNameSet.has(asset.name);
            let isAssetDisabled = atLimit && !isInPrompt;
            if (disableVideos && (asset.type === 'video' || asset.type === 'audio')) {
                isAssetDisabled = true;
            }
            const isDisabled = isAssetDisabled;
            if (!query || asset.name.toLowerCase().includes(query.toLowerCase()) || asset.id.toLowerCase().includes(query.toLowerCase())) {
                let category: 'asset' | 'scene' | 'video' | 'audio' = 'asset';
                if (asset.type === 'video') category = 'video';
                if (asset.type === 'audio') category = 'audio';
                items.push({
                    id: asset.id,
                    name: asset.name,
                    displayName: asset.name,
                    thumb: asset.refImageUrl,
                    disabled: isDisabled,
                    category: category,
                    inPrompt: isInPrompt
                });
            }
        }

        for (const si of deduplicatedSceneImages) {
            let isInPrompt = promptIdSet.has(si.id) || promptNameSet.has(si.name);
            // Storyboard suffix matching: prompt has 分镜S01 but si.name is 分镜E1_S01
            if (!isInPrompt && isStoryboardTag(si.name)) {
                let siSuffix = si.name.replace('分镜', ''); // "E1_S01"
                // Strip option suffix if present for matching base scene
                const suffixMatch = siSuffix.match(/-([a-zA-Z0-9]+)$/);
                if (suffixMatch) {
                    siSuffix = siSuffix.substring(0, siSuffix.length - suffixMatch[0].length);
                }

                for (const pName of promptNameSet) {
                    if (isStoryboardTag(pName)) {
                        let pSuffix = pName.replace('分镜', ''); // "S01"
                        const pMatch = pSuffix.match(/-([a-zA-Z0-9]+)$/);
                        if (pMatch) {
                            pSuffix = pSuffix.substring(0, pSuffix.length - pMatch[0].length);
                        }

                        // Exact match is required here to prevent B/C from being checked when only A is selected.
                        // We shouldn't match base scene with its options in the dropdown checklist.
                        if (si.name === pName) {
                            isInPrompt = true;
                            break;
                        }
                    }
                }
            }

            const isDisabled = atLimit && !isInPrompt;
            if (!query || si.name.toLowerCase().includes(query.toLowerCase()) || si.id.toLowerCase().includes(query.toLowerCase())) {
                items.push({
                    id: si.id,
                    name: si.name,
                    displayName: si.name,
                    thumb: si.refImageUrl,
                    disabled: isDisabled,
                    category: 'scene',
                    inPrompt: isInPrompt
                });
            }
        }

        for (const v of deduplicatedVideos) {
            const isInPrompt = promptIdSet.has(v.id) || promptNameSet.has(v.name);
            const isDisabled = (atLimit && !isInPrompt) || disableVideos;
            if (!query || v.name.toLowerCase().includes(query.toLowerCase()) || v.id.toLowerCase().includes(query.toLowerCase())) {
                items.push({
                    id: v.id,
                    name: v.name,
                    displayName: v.name,
                    thumb: v.refImageUrl,
                    disabled: isDisabled,
                    category: 'video',
                    inPrompt: isInPrompt,
                    canDelete: v.canDelete,
                    mediaUrl: v.mediaUrl,
                    mediaAssetId: v.mediaAssetId
                });
            }
        }

        for (const a of deduplicatedAudios) {
            const isInPrompt = promptIdSet.has(a.id) || promptNameSet.has(a.name);
            const isDisabled = (atLimit && !isInPrompt) || disableVideos;
            if (!query || a.name.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase())) {
                items.push({
                    id: a.id,
                    name: a.name,
                    displayName: a.name,
                    thumb: a.refImageUrl,
                    disabled: isDisabled,
                    category: 'audio',
                    inPrompt: isInPrompt,
                    canDelete: a.canDelete,
                    mediaUrl: a.mediaUrl,
                    mediaAssetId: a.mediaAssetId
                });
            }
        }

        if (query) {
            return items.filter(item =>
                item.name.toLowerCase().includes(query.toLowerCase()) ||
                item.displayName.toLowerCase().includes(query.toLowerCase())
            );
        }
        return items;
    }, [availableAssets, sceneImages, videos, audios, referencedAssetIds, maxMentions, query, value]);

    // Auto-scroll to newly uploaded item
    useEffect(() => {
        if (newlyUploadedIdRef.current && candidates.length > 0) {
            const idx = candidates.findIndex(c => c.id === newlyUploadedIdRef.current);
            if (idx >= 0) {
                setHighlightIdx(idx);
                newlyUploadedIdRef.current = null;
            }
        }
    }, [candidates]);

    // Handle input from contentEditable
    const handleInput = useCallback(() => {
        if (!editorRef.current) return;
        const newValue = htmlToText(editorRef.current);
        isInternalChange.current = true;
        lastRenderedValue.current = newValue;
        onChange(newValue);

        // Check for @ trigger
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Get text before cursor in current text node
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
                const textBefore = (range.startContainer.textContent || '').substring(0, range.startOffset);
                const atMatch = textBefore.match(/[@＠]([^\s@＠]*)$/);
                if (atMatch) {
                    setQuery(atMatch[1] || '');
                    setShowDropdown(true);
                    setHighlightIdx(0);
                } else {
                    setShowDropdown(false);
                    setQuery('');
                }
            } else {
                setShowDropdown(false);
            }
        }

        // Diff tags to detect removals and additions
        const currentTags = extractTags(newValue);
        const prevTags = prevTagsRef.current;

        // Handle removals
        for (const tag of prevTags) {
            if (!currentTags.includes(tag)) {
                // Use resolveTagToAsset for consistent matching
                const resolved = resolveTagToAsset({ name: tag }, assets as any[]);
                if (resolved) {
                    onUnmention((resolved as any).id);
                } else {
                    const resolvedSi = resolveTagToAsset({ name: tag }, sceneImages as any[]);
                    if (resolvedSi) onUnmention((resolvedSi as any).id);
                }
            }
        }

        // Handle direct text additions (like pasting tags)
        for (const tag of currentTags) {
            if (!prevTags.includes(tag)) {
                const resolved = resolveTagToAsset({ name: tag }, assets as any[]);
                if (resolved) {
                    onMention((resolved as any).id);
                } else {
                    const resolvedSi = resolveTagToAsset({ name: tag }, sceneImages as any[]);
                    if (resolvedSi) onMention((resolvedSi as any).id);
                }
            }
        }

        prevTagsRef.current = currentTags;
    }, [onChange, assets, sceneImages, onUnmention, onMention]);

    // Insert a mention chip at cursor
    const insertMentionAtCursor = useCallback((tagName: string, assetId?: string, thumb?: string, category?: string) => {
        const el = editorRef.current;
        if (!el) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        // Find and remove the @query text before cursor
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.startContainer;
            const text = textNode.textContent || '';
            const beforeCursor = text.substring(0, range.startOffset);
            const atIdx = Math.max(beforeCursor.lastIndexOf('@'), beforeCursor.lastIndexOf('＠'));
            if (atIdx >= 0) {
                // Remove @query or ＠query
                const newText = text.substring(0, atIdx) + text.substring(range.startOffset);
                textNode.textContent = newText;
                // Set cursor to atIdx
                range.setStart(textNode, atIdx);
                range.setEnd(textNode, atIdx);
            }
        }

        // Create chip element
        const colors = CHIP_COLORS[mode as 'video' | 'image'];
        const info = findAssetInfo(tagName, assets, sceneImages, assetId, videos, audios);

        const chip = document.createElement('span');
        chip.contentEditable = 'false';
        chip.dataset.mention = tagName;
        // Always attach #id anchor for exact matching (critical for names with parentheses)
        if (assetId && assetId !== '__base__') {
            chip.dataset.mentionId = assetId;
        }
        chip.style.cssText = `display:inline;background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;padding:1px 5px;margin:0;font-size:inherit;color:${colors.text};cursor:default;vertical-align:baseline;line-height:normal;user-select:all;font-weight:500;-webkit-box-decoration-break:clone;box-decoration-break:clone;`;

        if (thumb) {
            const img = document.createElement('img');
            img.src = thumb;
            img.style.cssText = 'width:14px;height:14px;border-radius:2px;object-fit:cover;vertical-align:-2px;margin-right:3px;display:inline-block;';
            chip.appendChild(img);
        } else {
            const icon = document.createElement('span');
            // Use correct emoji based on asset category, matching textToHtml defaultEmoji logic
            const resolvedCategory = category || info.category;
            icon.textContent = resolvedCategory === 'audio' ? '🎵' : resolvedCategory === 'video' ? '🎬' : (resolvedCategory === 'image' || resolvedCategory === 'scene' ? '🖼️' : '🧑');
            icon.style.cssText = 'vertical-align:-1px;margin-right:3px;display:inline-block;font-size:inherit;';
            chip.appendChild(icon);
        }

        const label = document.createTextNode(info.displayName);
        chip.appendChild(label);

        // Insert chip + trailing space
        range.insertNode(chip);
        const space = document.createTextNode('\u200B');
        chip.after(space);

        // Move cursor after space
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Trigger update
        handleInput();
    }, [handleInput, mode, assets, sceneImages, videos, audios]);

    // Select a candidate
    const selectCandidate = useCallback((candidate: typeof candidates[0]) => {
        if (candidate.disabled) return;

        insertMentionAtCursor(candidate.name, candidate.id, candidate.thumb, candidate.category);
        setShowDropdown(false);
        setQuery('');

        const asset = assets.find(a => a.id === candidate.id);
        if (asset) onMention(asset.id);
    }, [insertMentionAtCursor, assets, onMention]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!showDropdown || candidates.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(prev => (prev + 1) % candidates.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(prev => (prev - 1 + candidates.length) % candidates.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = candidates[highlightIdx];
            if (selected && !selected.disabled) {
                selectCandidate(selected);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowDropdown(false);
        }
    }, [showDropdown, candidates, highlightIdx, selectCandidate]);

    const handleBlur = useCallback(() => {
        setTimeout(() => {
            if (!isUploadingRef.current && !isDeletingRef.current) {
                setShowDropdown(false);
                if (onBlur) onBlur();
            }
        }, 200);
    }, [onBlur]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (!showDropdown || !dropdownRef.current) return;
        const items = dropdownRef.current.querySelectorAll('[data-candidate]');
        const item = items[highlightIdx] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightIdx, showDropdown]);

    // Show preview only on explicit mouse hover
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!showDropdown || !dropdownRef.current || hoveredIdx === null) {
            setPreviewImage(null);
            setMediaBlobUrl(null);
            return;
        }
        const items = dropdownRef.current.querySelectorAll('[data-candidate]');
        const item = items[hoveredIdx] as HTMLElement;
        if (item) {
            const candidate = candidates[hoveredIdx];
            const rect = item.getBoundingClientRect();

            // If it's a video or audio, we prepare to show media
            if ((candidate.category === 'video' || candidate.category === 'audio') && (candidate.mediaUrl || candidate.mediaAssetId)) {
                setPreviewImage({ url: candidate.category, x: rect.right, y: rect.top }); // url holds type here for media

                // Fetch blob if needed
                if (candidate.mediaUrl) {
                    setMediaBlobUrl(candidate.mediaUrl);
                } else if (candidate.mediaAssetId) {
                    // Lazy load blob using object URL for better media support
                    import('@/services/storage').then(({ loadAssetUrl }) => {
                        loadAssetUrl(candidate.mediaAssetId!).then(url => {
                            // Check if still hovering
                            if (hoveredIdx !== null) {
                                setMediaBlobUrl(url || null);
                            }
                        });
                    });
                }
            } else if (candidate.thumb) {
                // Regular image preview
                setPreviewImage({ url: candidate.thumb, x: rect.right, y: rect.top });
                setMediaBlobUrl(null);
            } else {
                setPreviewImage(null);
                setMediaBlobUrl(null);
            }
        } else {
            setPreviewImage(null);
            setMediaBlobUrl(null);
        }
    }, [hoveredIdx, showDropdown, candidates]);

    // Compute dropdown position when it opens
    useEffect(() => {
        if (!showDropdown || !editorRef.current) {
            setDropdownPos(null);
            return;
        }
        const rect = editorRef.current.getBoundingClientRect();
        // If there is less than 240px space above the editor, pop DOWN instead of UP
        const direction = rect.top < 240 ? 'down' : 'up';
        setDropdownDirection(direction);

        setDropdownPos({
            top: direction === 'up' ? rect.top - 4 : rect.bottom + 4,
            left: rect.left,
        });
    }, [showDropdown]);

    return (
        <div className="relative flex-1 flex flex-col">
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className={className}
                data-placeholder={placeholder}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto', overflowX: 'hidden', textAlign: 'justify' }}
            />

            {onAssetUpload && (
                <>
                    <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        ref={videoUploadRef}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && onAssetUpload) {
                                // Clear query so the new item won't be filtered out
                                setQuery('');
                                const newId = await onAssetUpload('video', file);
                                if (newId) {
                                    newlyUploadedIdRef.current = newId;
                                    // The dropdown will stay open because we fixed the innerHTML rewrite bug.
                                }
                                e.target.value = '';
                            }
                        }}
                    />
                    <input
                        type="file"
                        accept="audio/*,video/mp4,video/quicktime,video/webm"
                        className="hidden"
                        ref={audioUploadRef}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && onAssetUpload) {
                                setQuery('');
                                try {
                                    // Extract audio if a video file is uploaded
                                    const audioFile = await extractAudioFromVideo(file);
                                    const newId = await onAssetUpload('audio', audioFile);
                                    if (newId) {
                                        newlyUploadedIdRef.current = newId;
                                    }
                                } catch (error) {
                                    console.error("Failed to process audio:", error);
                                    alert("音频提取失败，请检查文件格式。");
                                }
                                e.target.value = '';
                            }
                        }}
                    />
                </>
            )}

            {showDropdown && candidates.length > 0 && dropdownPos && ReactDOM.createPortal(
                <>
                    <div
                        ref={dropdownRef}
                        style={dropdownDirection === 'up' ? {
                            position: 'fixed',
                            bottom: `${window.innerHeight - dropdownPos.top}px`,
                            left: `${dropdownPos.left}px`,
                            zIndex: 9999,
                        } : {
                            position: 'fixed',
                            top: `${dropdownPos.top}px`,
                            left: `${dropdownPos.left}px`,
                            zIndex: 9999,
                        }}
                        className="flex w-[800px] max-w-[90vw] max-h-56 bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-xl text-gray-900 dark:text-gray-100 overflow-hidden"
                    >
                        {/* Left Column: Assets */}
                        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-white/10 w-0">
                            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-white/5 shrink-0 flex items-center justify-between">
                                <span className="truncate">资产 (Assets)</span>
                                {maxMentions !== undefined && (
                                    <span className="text-[9px] font-normal opacity-70 shrink-0 ml-2">
                                        {new Set([...value.matchAll(TAG_REGEX)].map(m => (m[2] || m[4]) || (m[1] || m[3]))).size}/{maxMentions}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto py-1">
                                {candidates.map((c, i) => c.category === 'asset' && (
                                    <div
                                        key={c.id}
                                        data-candidate
                                        className={`
                                        flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors
                                        ${i === highlightIdx ? 'bg-indigo-100 dark:bg-banana-500/20 text-indigo-700 dark:text-inherit' : 'hover:bg-gray-100 dark:hover:bg-white/5'}
                                        ${c.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                                    `}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!c.disabled) selectCandidate(c);
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightIdx(i);
                                            setHoveredIdx(i);
                                        }}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    >
                                        <span className="text-[10px] shrink-0">🧑</span>
                                        <span className="flex-1 truncate">{c.displayName}</span>
                                        {c.inPrompt && (
                                            <span className="text-[9px] text-green-600 dark:text-green-400/70 shrink-0">✅</span>
                                        )}
                                    </div>
                                ))}
                                {candidates.filter(c => c.category === 'asset').length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无资产</div>
                                )}
                            </div>
                        </div>

                        {/* Right Column 1: Scenes */}
                        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-white/10 w-0">
                            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-white/5 shrink-0 truncate">
                                分镜 (Scenes)
                            </div>
                            <div className="flex-1 overflow-y-auto py-1">
                                {candidates.map((c, i) => c.category === 'scene' && (
                                    <div
                                        key={c.id}
                                        data-candidate
                                        className={`
                                        flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors
                                        ${i === highlightIdx ? 'bg-indigo-100 dark:bg-banana-500/20 text-indigo-700 dark:text-inherit' : 'hover:bg-gray-100 dark:hover:bg-white/5'}
                                        ${c.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                                    `}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!c.disabled) selectCandidate(c);
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightIdx(i);
                                            setHoveredIdx(i);
                                        }}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    >
                                        <span className="text-[10px] shrink-0">🎬</span>
                                        <span className="flex-1 truncate">{c.displayName}</span>
                                        {c.inPrompt && (
                                            <span className="text-[9px] text-green-600 dark:text-green-400/70 shrink-0">✅</span>
                                        )}
                                    </div>
                                ))}
                                {candidates.filter(c => c.category === 'scene').length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无分镜</div>
                                )}
                            </div>
                        </div>

                        {/* Right Column 2: Videos */}
                        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-white/10 w-0">
                            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-white/5 shrink-0 truncate">
                                视频 (Videos)
                            </div>
                            <div className="flex-1 overflow-y-auto py-1">
                                {candidates.map((c, i) => c.category === 'video' && (
                                    <div
                                        key={c.id}
                                        id={`mention-item-${c.id}`}
                                        data-candidate
                                        className={`
                                        flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors
                                        ${i === highlightIdx ? 'bg-indigo-100 dark:bg-banana-500/20 text-indigo-700 dark:text-inherit' : 'hover:bg-gray-100 dark:hover:bg-white/5'}
                                        ${c.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                                    `}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!c.disabled) selectCandidate(c);
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightIdx(i);
                                            setHoveredIdx(i);
                                        }}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    >
                                        <span className="text-[10px] shrink-0">🎥</span>
                                        <span className="flex-1 truncate">{c.displayName}</span>
                                        {c.inPrompt && (
                                            <span className="text-[9px] text-green-600 dark:text-green-400/70 shrink-0">✅</span>
                                        )}
                                        {c.canDelete && (
                                            <button
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    isDeletingRef.current = true;
                                                    setTimeout(() => {
                                                        if (window.confirm('确认删除此视频素材？')) {
                                                            if (!onAssetDelete) {
                                                                alert('系统错误：删除功能未就绪，请按 F5 刷新页面后再试。');
                                                                setTimeout(() => { isDeletingRef.current = false; editorRef.current?.focus(); }, 300);
                                                                return;
                                                            }
                                                            console.log("Deleting video asset:", c.id);
                                                            onAssetDelete(c.id);

                                                            if (c.inPrompt) {
                                                                onUnmention(c.id);
                                                                // Remove from text value
                                                                const regex = new RegExp(`\\[@图像_${c.name}(?:#[^\\]]+)?\\]|@图像_${c.name}(?:#[^\\s\\]]+)?|@${c.name}(?:#[^\\s\\]]+)?`, 'g');
                                                                onChange(value.replace(regex, ''));
                                                                // Remove from DOM
                                                                if (editorRef.current) {
                                                                    const chips = editorRef.current.querySelectorAll(`span[data-mention="${c.name}"]`);
                                                                    chips.forEach(chip => chip.remove());
                                                                }
                                                            }
                                                        }
                                                        setTimeout(() => { isDeletingRef.current = false; editorRef.current?.focus(); }, 300);
                                                    }, 10);
                                                }}
                                                className="ml-auto text-gray-400 hover:text-red-500 hover:bg-red-500/10 p-1 rounded transition-colors"
                                                title="删除素材"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {candidates.filter(c => c.category === 'video').length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无视频</div>
                                )}
                            </div>
                            {onAssetUpload && (
                                <div className="p-1 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-dark-900 shrink-0">
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        disabled={disableVideos}
                                        onClick={() => {
                                            if (disableVideos) return;
                                            isUploadingRef.current = true;
                                            videoUploadRef.current?.click();
                                            const onWindowFocus = () => {
                                                setTimeout(() => {
                                                    isUploadingRef.current = false;
                                                    // Retain focus manually if needed
                                                    if (showDropdown) editorRef.current?.focus();
                                                }, 300);
                                                window.removeEventListener('focus', onWindowFocus);
                                            };
                                            window.addEventListener('focus', onWindowFocus);
                                        }}
                                        className={`w-full py-1.5 text-xs bg-white dark:bg-dark-800 rounded flex items-center justify-center gap-1 transition-colors ${disableVideos
                                                ? 'text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 cursor-not-allowed opacity-50'
                                                : 'text-indigo-600 dark:text-banana-400 hover:bg-indigo-50 dark:hover:bg-banana-500/10 border border-indigo-200 dark:border-banana-500/30'
                                            }`}
                                    >
                                        <span className="text-sm">+</span> 上传本地视频
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right Column 3: Audios */}
                        <div className="flex-1 flex flex-col w-0">
                            <div className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-white/5 shrink-0 truncate">
                                音频 (Audios)
                            </div>
                            <div className="flex-1 overflow-y-auto py-1">
                                {candidates.map((c, i) => c.category === 'audio' && (
                                    <div
                                        key={c.id}
                                        data-candidate
                                        className={`
                                        flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors
                                        ${i === highlightIdx ? 'bg-indigo-100 dark:bg-banana-500/20 text-indigo-700 dark:text-inherit' : 'hover:bg-gray-100 dark:hover:bg-white/5'}
                                        ${c.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                                    `}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!c.disabled) selectCandidate(c);
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightIdx(i);
                                            setHoveredIdx(i);
                                        }}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    >
                                        <span className="text-[10px] shrink-0">🎵</span>
                                        <span className="flex-1 truncate">{c.displayName}</span>
                                        {c.inPrompt && (
                                            <span className="text-[9px] text-green-600 dark:text-green-400/70 shrink-0">✅</span>
                                        )}
                                        {c.canDelete && (
                                            <button
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    isDeletingRef.current = true;
                                                    setTimeout(() => {
                                                        if (window.confirm('确认删除此音频素材？')) {
                                                            if (!onAssetDelete) {
                                                                alert('系统错误：删除功能未就绪，请按 F5 刷新页面后再试。');
                                                                setTimeout(() => { isDeletingRef.current = false; editorRef.current?.focus(); }, 300);
                                                                return;
                                                            }
                                                            console.log("Deleting audio asset:", c.id);
                                                            onAssetDelete(c.id);

                                                            if (c.inPrompt) {
                                                                onUnmention(c.id);
                                                                // Remove from text value
                                                                const regex = new RegExp(`\\[@图像_${c.name}(?:#[^\\]]+)?\\]|@图像_${c.name}(?:#[^\\s\\]]+)?|@${c.name}(?:#[^\\s\\]]+)?`, 'g');
                                                                onChange(value.replace(regex, ''));
                                                                // Remove from DOM
                                                                if (editorRef.current) {
                                                                    const chips = editorRef.current.querySelectorAll(`span[data-mention="${c.name}"]`);
                                                                    chips.forEach(chip => chip.remove());
                                                                }
                                                            }
                                                        }
                                                        setTimeout(() => { isDeletingRef.current = false; editorRef.current?.focus(); }, 300);
                                                    }, 10);
                                                }}
                                                className="ml-auto text-gray-400 hover:text-red-500 hover:bg-red-500/10 p-1 rounded transition-colors"
                                                title="删除素材"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {candidates.filter(c => c.category === 'audio').length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无音频</div>
                                )}
                            </div>
                            {onAssetUpload && (
                                <div className="p-1 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-dark-900 shrink-0">
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        disabled={disableVideos}
                                        onClick={() => {
                                            if (disableVideos) return;
                                            isUploadingRef.current = true;
                                            audioUploadRef.current?.click();
                                            const onWindowFocus = () => {
                                                setTimeout(() => {
                                                    isUploadingRef.current = false;
                                                    // Retain focus manually if needed
                                                    if (showDropdown) editorRef.current?.focus();
                                                }, 300);
                                                window.removeEventListener('focus', onWindowFocus);
                                            };
                                            window.addEventListener('focus', onWindowFocus);
                                        }}
                                        className={`w-full py-1.5 text-xs bg-white dark:bg-dark-800 rounded flex items-center justify-center gap-1 transition-colors ${disableVideos
                                                ? 'text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 cursor-not-allowed opacity-50'
                                                : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30'
                                            }`}
                                    >
                                        <span className="text-sm">+</span> 上传本地音频 (支持MP4提取)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {previewImage && (
                        <div
                            style={{
                                position: 'fixed',
                                top: Math.min(previewImage.y, window.innerHeight - 250),
                                left: previewImage.x + 8,
                                zIndex: 10000,
                            }}
                            className="p-1 bg-white dark:bg-dark-900 border border-gray-200 dark:border-white/10 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-100"
                        >
                            {previewImage.url === 'video' ? (
                                mediaBlobUrl ? (
                                    <video src={mediaBlobUrl} autoPlay loop muted playsInline className="max-w-[240px] max-h-[240px] rounded-md" style={{ objectFit: 'contain' }} />
                                ) : (
                                    <div className="w-[240px] h-[135px] flex items-center justify-center bg-gray-100 dark:bg-dark-800 rounded-md">
                                        <span className="text-xs text-gray-400">加载视频中...</span>
                                    </div>
                                )
                            ) : previewImage.url === 'audio' ? (
                                mediaBlobUrl ? (
                                    <div className="bg-white dark:bg-dark-900 rounded p-2">
                                        <audio src={mediaBlobUrl} autoPlay controls className="w-[240px] h-10 outline-none" />
                                    </div>
                                ) : (
                                    <div className="w-[240px] h-10 flex items-center justify-center bg-gray-100 dark:bg-dark-800 rounded-md">
                                        <span className="text-xs text-gray-400">加载音频中...</span>
                                    </div>
                                )
                            ) : (
                                <img src={previewImage.url} className="max-w-[240px] max-h-[240px] rounded-md" style={{ objectFit: 'contain' }} />
                            )}
                        </div>
                    )}
                </>,
                document.body
            )}
        </div>
    );
};

export default MentionTextarea;
