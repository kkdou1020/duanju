import React from 'react';
import { Node, Edge, Connection, addEdge } from '@xyflow/react';
import { Scene, Asset, ImageGenStatus } from '@/shared/types';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag, ASSET_TAG_REGEX, ParsedTag } from '@/shared/asset-tags';
import { loadAssetBase64 } from '@/services/storage';

const API_BASE = (import.meta as any).env?.DEV ? 'http://127.0.0.1:3002/api' : '/api';

/**
 * 提取视频首帧或尾帧的 Blob 对象
 */
export const extractVideoFrame = (videoUrl: string, timeType: 'start' | 'end'): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');

        video.style.position = 'absolute';
        video.style.width = '0';
        video.style.height = '0';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);

        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Video frame extraction timed out'));
        }, 15000);

        const cleanup = () => {
            clearTimeout(timeoutId);
            video.onloadedmetadata = null;
            video.onseeked = null;
            video.onerror = null;
            if (video.parentNode) {
                video.parentNode.removeChild(video);
            }
        };

        video.onloadedmetadata = () => {
            if (timeType === 'start') {
                video.currentTime = 0;
            } else {
                video.currentTime = Math.max(0, video.duration - 0.1);
            }
        };

        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        cleanup();
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas toBlob returned null'));
                        }
                    }, 'image/png');
                } else {
                    cleanup();
                    reject(new Error('Canvas 2D context not available'));
                }
            } catch (e) {
                cleanup();
                reject(e);
            }
        };

        video.onerror = () => {
            cleanup();
            reject(new Error('Failed to load video for frame extraction'));
        };

        if (!videoUrl.startsWith('blob:')) {
            video.crossOrigin = 'anonymous';
        }

        video.muted = true;
        video.playsInline = true;

        let resolvedSrc = videoUrl;
        if (videoUrl.startsWith('http')) {
            resolvedSrc = `${API_BASE}/media/download-proxy?url=${encodeURIComponent(videoUrl)}`;
        }
        video.src = resolvedSrc;
        video.load();
    });
};

/**
 * 获取 MiniMap 中不同节点的颜色
 */
export const getMiniMapNodeColor = (node: Node) => {
    switch (node.type) {
        case 'imagePrompt':
            return '#06b6d4'; // 青色
        case 'imageOutput':
            return '#ec4899'; // 粉色
        case 'videoPrompt':
        case 'videoOutput':
            return '#a855f7'; // 紫色
        case 'firstLastFrame':
            return '#eab308'; // 黄色
        case 'asset':
            return '#06b6d4'; // 青色资产
        case 'sceneRef':
            return '#10b981'; // 绿色分镜引用
        case 'customNote':
            return '#f59e0b'; // 琥珀黄便签
        default:
            return '#4b5563'; // 默认灰
    }
};

/**
 * 高亮提示词中的 @图像 标签
 */
export const renderHighlightedPrompt = (text: string) => {
    if (!text) return null;

    const parts = [];
    const localRegex = new RegExp(ASSET_TAG_REGEX.source, ASSET_TAG_REGEX.flags);
    let lastIndex = 0;
    let match;

    while ((match = localRegex.exec(text)) !== null) {
        const index = match.index;
        if (index > lastIndex) {
            parts.push(text.substring(lastIndex, index));
        }

        const raw = match[0];
        const displayName = match[1] || match[3];
        const assetId = match[2] || match[4];

        parts.push({ raw, displayName, assetId });
        lastIndex = localRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return (
        <>
            {parts.map((part, i) => {
                if (typeof part === 'string') {
                    return <span key={i}>{part}</span>;
                } else {
                    return (
                        <span
                            key={i}
                            className="bg-banana-500/15 text-banana-400 font-bold rounded px-1 py-0.5 inline-block text-[10px] mx-0.5"
                        >
                            {part.displayName}
                        </span>
                    );
                }
            })}
        </>
    );
};

/**
 * 转换浏览器 blob URL 为 Base64 格式
 */
export const blobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
    try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    resolve(null);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("[canvasHelpers] Failed to convert blob URL to base64", e);
        return null;
    }
};

/**
 * 将提示词解析出来的 Tag 列表转为具体的主键 ID 数组
 */
export const getReferencedIdsFromTags = (tags: ParsedTag[], allScenes: Scene[], assets: Asset[]): string[] => {
    const ids: string[] = [];
    tags.forEach(tag => {
        if (isStoryboardTag(tag.name)) {
            let sceneIdStr = tag.name.replace('分镜', '');
            const parts = sceneIdStr.split('-');
            if (parts.length > 1) {
                const lastPart = parts[parts.length - 1];
                if (['A', 'B', 'C'].includes(lastPart.toUpperCase())) {
                    sceneIdStr = parts.slice(0, -1).join('-');
                }
            }
            const partsUnderscore = sceneIdStr.split('_');
            if (partsUnderscore.length > 1) {
                const lastPart = partsUnderscore[partsUnderscore.length - 1];
                if (['A', 'B', 'C'].includes(lastPart.toUpperCase())) {
                    sceneIdStr = partsUnderscore.slice(0, -1).join('_');
                }
            }
            const sceneObj = allScenes.find(s =>
                s.id === sceneIdStr ||
                s.id === `scene_${sceneIdStr}` ||
                `scene_${s.id}` === sceneIdStr ||
                `scene_${s.id}` === `scene_${sceneIdStr}`
            );
            if (sceneObj) {
                const optId = tag.name.split('-').pop() || 'A';
                ids.push(`scene_img_${sceneObj.id}`);
                ids.push(`scene_img_${sceneObj.id}_${optId}`);
            }
        } else {
            if (tag.id) {
                ids.push(tag.id);
            } else {
                const asset = resolveTagToAsset(tag, assets);
                if (asset) {
                    ids.push(asset.id);
                }
            }
        }
    });
    return ids;
};

interface SyncParams {
    npPrompt: string;
    videoPrompt: string;
    nodes: Node[];
    edges: Edge[];
    allScenes: Scene[];
    assets: Asset[];
    activeOption: string;
    onExtractFirstLastFrame: (nodeId: string, timeType: 'start' | 'end') => void;
}

/**
 * 纯函数计算：将输入的提示词同步到 React Flow 节点与连线状态
 */
export const computePromptsSyncToCanvas = ({
    npPrompt,
    videoPrompt,
    nodes,
    edges,
    allScenes,
    assets,
    activeOption,
    onExtractFirstLastFrame
}: SyncParams) => {
    // 1. 解析所有生图/生视频配置节点中引用的标签列表
    const nodeToTagsMap = new Map<string, { tags: ParsedTag[], isVideo: boolean, targetHandle: string }>();

    nodes.forEach((n: any) => {
        if (n.id === 'image-prompt') {
            nodeToTagsMap.set(n.id, {
                tags: extractAssetTags(npPrompt || ''),
                isVideo: false,
                targetHandle: 'target'
            });
        } else if (n.id === 'video-prompt') {
            nodeToTagsMap.set(n.id, {
                tags: extractAssetTags(videoPrompt || ''),
                isVideo: true,
                targetHandle: 'target-video-images'
            });
        }
    });

    const uniqueNodesMap = new Map<string, any>();
    nodes.forEach((n: any) => { if (n && n.id) uniqueNodesMap.set(n.id, n); });
    const nextNodes = Array.from(uniqueNodesMap.values());

    const imageTags = extractAssetTags(npPrompt || '');
    const imageReferencedIds = getReferencedIdsFromTags(imageTags, allScenes, assets);
    const videoTags = extractAssetTags(videoPrompt || '');
    const videoReferencedIds = getReferencedIdsFromTags(videoTags, allScenes, assets);

    // 2. 统一清理过时连线
    const cleanedEdges = edges.filter((e: any) => {
        const targetInfo = nodeToTagsMap.get(e.target);
        if (!targetInfo) return true; // 保持其他连线（如 prompt -> output）

        const sourceNode = nextNodes.find((n: any) => n.id === e.source);
        if (sourceNode) {
            if (sourceNode.type === 'asset') {
                return targetInfo.tags.some(tag => {
                    if (tag.id) return tag.id === sourceNode.data.asset.id;
                    return tag.name === sourceNode.data.asset.name;
                });
            } else if (sourceNode.type === 'sceneRef') {
                return targetInfo.tags.some(tag => {
                    if (!isStoryboardTag(tag.name)) return false;
                    const sceneObj = sourceNode.data.scene;
                    const tagSceneId = tag.name.replace('分镜', '').split('-')[0].split('_')[0];
                    return sceneObj.id === tagSceneId || `scene_${sceneObj.id}` === tagSceneId;
                });
            } else if (sourceNode.type === 'firstLastFrame') {
                const isStart = e.sourceHandle === 'source-start';
                const expectedName = isStart ? '首帧' : '尾帧';
                const fallbackId = isStart ? `first_frame_${sourceNode.id}` : `last_frame_${sourceNode.id}`;
                const realId = isStart ? sourceNode.data?.startImageAssetId : sourceNode.data?.endImageAssetId;

                return targetInfo.tags.some(tag => {
                    if (tag.name !== expectedName) return false;
                    return tag.id === fallbackId || (realId && tag.id === realId) || !tag.id;
                });
            }
        }
        return true;
    });

    let changedNodes = false;
    let changedEdges = false;

    // 3. 循环处理各个节点的标签生成与连线补全
    let newImageRefIdx = nextNodes.filter((n: any) => n.type === 'sceneRef' || n.type === 'asset').length;

    nodeToTagsMap.forEach((info, targetNodeId) => {
        info.tags.forEach(tag => {
            let sourceNodeId = '';
            let nodeType: 'sceneRef' | 'asset' | 'firstLastFrame' | '' = '';
            let sceneObj: any = null;
            let assetObj: any = null;
            let optId: string | undefined = undefined;

            if (isStoryboardTag(tag.name)) {
                let sceneIdStr = tag.name.replace('分镜', '');
                const parts = sceneIdStr.split('-');
                if (parts.length > 1) {
                    const lastPart = parts[parts.length - 1];
                    if (['A', 'B', 'C'].includes(lastPart.toUpperCase())) {
                        optId = lastPart.toUpperCase();
                        sceneIdStr = parts.slice(0, -1).join('-');
                    }
                }
                const partsUnderscore = sceneIdStr.split('_');
                if (partsUnderscore.length > 1) {
                    const lastPart = partsUnderscore[partsUnderscore.length - 1];
                    if (['A', 'B', 'C'].includes(lastPart.toUpperCase())) {
                        optId = lastPart.toUpperCase();
                        sceneIdStr = partsUnderscore.slice(0, -1).join('_');
                    }
                }

                sceneObj = allScenes.find(s =>
                    s.id === sceneIdStr ||
                    s.id === `scene_${sceneIdStr}` ||
                    `scene_${s.id}` === sceneIdStr ||
                    `scene_${s.id}` === `scene_${sceneIdStr}`
                );

                if (sceneObj) {
                    sourceNodeId = `scene_${sceneObj.id}`;
                    nodeType = 'sceneRef';
                }
            } else if (tag.name === '首帧' || tag.name === '尾帧') {
                const matchedNode = nextNodes.find((n: any) =>
                    n.type === 'firstLastFrame' && (
                        n.id === tag.id ||
                        n.data?.startImageAssetId === tag.id ||
                        n.data?.endImageAssetId === tag.id ||
                        tag.id === `first_frame_${n.id}` ||
                        tag.id === `last_frame_${n.id}` ||
                        nextNodes.filter((x: any) => x.type === 'firstLastFrame').length === 1
                    )
                );
                if (matchedNode) {
                    sourceNodeId = matchedNode.id;
                    nodeType = 'firstLastFrame';
                } else {
                    sourceNodeId = 'first-last-frame';
                    nodeType = 'firstLastFrame';
                }
            } else {
                assetObj = resolveTagToAsset(tag, assets);
                if (assetObj) {
                    sourceNodeId = `asset_${assetObj.id}`;
                    nodeType = 'asset';
                }
            }

            if (!sourceNodeId) return;

            // 检查节点是否存在，不存在则创建
            const existingNode = nextNodes.find((n: any) => {
                if (n.id === sourceNodeId) return true;
                if (nodeType === 'asset' && n.type === 'asset') {
                    return n.data?.asset?.id === (assetObj?.id || tag.id);
                }
                if (nodeType === 'sceneRef' && n.type === 'sceneRef') {
                    return n.data?.scene?.id === sceneObj.id && n.data?.optionId === optId;
                }
                if (nodeType === 'firstLastFrame' && n.type === 'firstLastFrame') {
                    return true;
                }
                return false;
            });
            const nodeExists = !!existingNode;
            const actualSourceId = existingNode ? existingNode.id : sourceNodeId;

            if (!nodeExists) {
                const nodeY = info.isVideo ? (950 + newImageRefIdx * 160) : (200 + newImageRefIdx * 160);
                newImageRefIdx++;

                if (nodeType === 'sceneRef') {
                    nextNodes.push({
                        id: sourceNodeId,
                        type: 'sceneRef',
                        position: { x: 80, y: nodeY },
                        data: {
                            scene: sceneObj,
                            optionId: optId
                        }
                    });
                } else if (nodeType === 'asset') {
                    nextNodes.push({
                        id: sourceNodeId,
                        type: 'asset',
                        position: { x: 80, y: nodeY },
                        data: { asset: assetObj }
                    });
                } else if (nodeType === 'firstLastFrame') {
                    nextNodes.push({
                        id: sourceNodeId,
                        type: 'firstLastFrame',
                        position: { x: 740, y: 720 },
                        data: {
                            onExtract: (timeType: 'start' | 'end') => onExtractFirstLastFrame(sourceNodeId, timeType)
                        }
                    });
                }
                changedNodes = true;
            }

            // 检查边是否存在，不存在则添加
            const sourceHandleId = nodeType === 'firstLastFrame' ? (tag.name === '首帧' ? 'source-start' : 'source-end') : undefined;
            const exists = cleanedEdges.some(e =>
                e.source === actualSourceId &&
                e.target === targetNodeId &&
                (!sourceHandleId || e.sourceHandle === sourceHandleId)
            );
            if (!exists) {
                const tagIdOrName = tag.id || tag.name;
                cleanedEdges.push({
                    id: `edge_${tagIdOrName}_to_${targetNodeId}${sourceHandleId ? `_${tag.name === '首帧' ? 'start' : 'end'}` : ''}`,
                    source: actualSourceId,
                    sourceHandle: sourceHandleId,
                    target: targetNodeId,
                    targetHandle: info.targetHandle,
                    animated: true,
                    style: { stroke: info.isVideo ? '#a855f7' : '#06b6d4', strokeWidth: 2 }
                } as any);
                changedEdges = true;
            }
        });
    });

    // 4. 清理无任何连线的孤儿卡片
    const finalNodes = nextNodes.filter((node: any) => {
        if (node.type === 'asset' || node.type === 'sceneRef') {
            const hasOutgoingEdges = cleanedEdges.some(e => e.source === node.id);
            if (!hasOutgoingEdges) {
                changedNodes = true;
                return false;
            }
        }
        return true;
    });

    const edgeLengthDiff = edges.length !== cleanedEdges.length ||
        JSON.stringify(edges.map(e => e.id).sort()) !== JSON.stringify(cleanedEdges.map(e => e.id).sort());

    return {
        nextNodes: finalNodes,
        nextEdges: cleanedEdges,
        changedNodes,
        changedEdges: changedEdges || edgeLengthDiff
    };
};
