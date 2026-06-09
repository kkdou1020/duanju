import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    useNodesState,
    useEdgesState,
    addEdge,
    Connection
} from '@xyflow/react';
type Node = any;
type Edge = any;
import { Scene, Asset, GlobalStyle, ImageGenStatus } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { loadAssetBase64, saveAsset, loadAssetUrl } from '@/services/storage';
import { generateSpeech, pcmToWav } from '@/services/ai';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag, ParsedTag } from '@/shared/asset-tags';
import { useCanvasHistory } from './useCanvasHistory';
import { useCanvasClipboard } from './useCanvasClipboard';
import { useCanvasShortcuts } from './useCanvasShortcuts';
import {
    extractVideoFrame,
    computePromptsSyncToCanvas,
    getReferencedIdsFromTags,
    blobUrlToBase64
} from '../utils/canvasHelpers';

interface UseCanvasStateProps {
    scene: Scene;
    allScenes: Scene[];
    assets: Asset[];
    styleState: GlobalStyle;
    labels: Translation;
    onSceneUpdate: (sceneId: string, updates: Partial<Scene> | ((prev: Scene) => Partial<Scene>)) => void;
    onGenerateImage: (scene: Scene, optionId?: string) => Promise<string>;
    onGenerateVideo: (scene: Scene, optionId?: string) => Promise<any>;
    onUploadImage: (file: File, optionId?: string) => Promise<void>;
    onUploadVideo: (file: File, optionId?: string) => Promise<void>;
    onDeleteImage: (optionId?: string) => void;
    onDeleteVideo: (optionId?: string) => void;
    onSelectScene: (sceneId: string) => void;
    onAddScene: () => void;
    genStatusMap: Record<string, ImageGenStatus>;
    videoStatusMap: Record<string, ImageGenStatus>;
    initialOptionId?: string;
    isOpen: boolean;
    language?: string;
}

export function useCanvasState({
    scene,
    allScenes,
    assets,
    styleState,
    labels,
    onSceneUpdate,
    onGenerateImage,
    onGenerateVideo,
    onUploadImage,
    onUploadVideo,
    onDeleteImage,
    onDeleteVideo,
    onSelectScene,
    onAddScene,
    genStatusMap,
    videoStatusMap,
    initialOptionId,
    isOpen,
    language = 'Chinese'
}: UseCanvasStateProps) {
    const [activeOption, setActiveOption] = useState<'A' | 'B' | 'C'>((initialOptionId as any) || 'A');
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    const currentGenStatus = genStatusMap[activeOption] || ImageGenStatus.IDLE;
    const currentVideoStatus = videoStatusMap[activeOption] || ImageGenStatus.IDLE;
    const [ttsLoading, setTtsLoading] = useState(false);

    // React Flow 状态
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const [hoveredItem, setHoveredItem] = useState<{
        type: 'asset' | 'scene';
        data: any;
        rect: { top: number; right: number; bottom: number; left: number };
    } | null>(null);
    const pendingSaveRef = useRef(false);

    const latestNodesRef = useRef(nodes);
    const latestEdgesRef = useRef(edges);
    const lastSyncRef = useRef({ sceneId: '', activeOption: '', np_prompt: '', video_prompt: '', assetsCount: 0, instanceInitialized: false });

    const isFirstSyncRef = useRef(true);
    const lastGenStatusRef = useRef(currentGenStatus);
    const lastVideoStatusRef = useRef(currentVideoStatus);

    useEffect(() => {
        latestNodesRef.current = nodes;
    }, [nodes]);

    useEffect(() => {
        latestEdgesRef.current = edges;
    }, [edges]);

    const getOptionData = useCallback((optionId: string) => {
        const rawOption = scene.prompt_options?.find(o => o.option_id === optionId);
        const option = rawOption ? {
            ...rawOption,
            refImageMode: rawOption.refImageMode || (optionId === 'A' ? (scene.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto')) : 'auto'),
            videoModel: rawOption.videoModel || (optionId === 'A' ? (scene.videoModel || 'doubao-seedance-2-0-260128') : 'doubao-seedance-2-0-260128')
        } : {
            np_prompt: optionId === 'A' ? (scene.np_prompt || '') : '',
            video_prompt: optionId === 'A' ? (scene.video_prompt || '') : '',
            camera: optionId === 'A' ? (scene.camera || '') : '',
            lens: optionId === 'A' ? (scene.lens || '') : '',
            focal_length: optionId === 'A' ? (scene.focal_length || '') : '',
            aperture: optionId === 'A' ? (scene.aperture || '') : '',
            imageUrl: optionId === 'A' ? scene.imageUrl : '',
            imageAssetId: optionId === 'A' ? scene.imageAssetId : '',
            videoUrl: optionId === 'A' ? scene.videoUrl : '',
            videoAssetId: optionId === 'A' ? scene.videoAssetId : '',
            assetIds: optionId === 'A' ? (scene.assetIds || []) : [],
            videoAssetIds: optionId === 'A' ? (scene.videoAssetIds || []) : [],
            refImageMode: optionId === 'A' ? (scene.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto')) : 'auto',
            videoModel: optionId === 'A' ? (scene.videoModel || 'doubao-seedance-2-0-260128') : 'doubao-seedance-2-0-260128'
        };
        return option;
    }, [scene]);

    // 保存画布坐标与节点设计
    const handleSaveLayout = useCallback(() => {
        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        const serializableNodes = currentNodes.map(n => {
            const stripped = { ...n };
            const strippedData = { ...n.data };
            Object.keys(strippedData).forEach(key => {
                if (typeof strippedData[key] === 'function') {
                    delete strippedData[key];
                }
            });
            delete strippedData.connectedImages;
            delete strippedData.assets;
            delete strippedData.sceneImages;
            stripped.data = strippedData;
            return stripped;
        });

        onSceneUpdate(scene.id, (prev) => {
            const canvas = prev.canvas ? { ...prev.canvas } : {};
            canvas[activeOption] = {
                nodes: serializableNodes,
                edges: currentEdges
            };
            return { canvas };
        });
    }, [activeOption, scene.id, onSceneUpdate]);

    const saveTimeoutRef = useRef<any>(null);

    const debouncedSaveLayout = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            handleSaveLayout();
        }, 300);
    }, [handleSaveLayout]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // 撤销 / 重做与快捷键及剪切板支持
    const { undo, redo, takeHistorySnapshot, pastCount, futureCount } = useCanvasHistory({
        latestNodesRef,
        latestEdgesRef,
        setNodes,
        setEdges,
        activeOption,
        sceneId: scene.id,
        onSceneUpdate,
        getOptionData,
        syncEdgesToPromptText: useCallback((restoredNodes: any[], restoredEdges: any[]) => {
            const imageEdges = restoredEdges.filter(e => e.target === 'image-prompt');
            const imageTags: string[] = [];
            imageEdges.forEach(edge => {
                const sourceNode = restoredNodes.find(n => n.id === edge.source);
                if (!sourceNode) return;
                const isAsset = sourceNode.type === 'asset';
                const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
                let assetName = '';
                let assetId = '';
                if (isAsset) {
                    assetName = sourceNode.data.asset?.name || '';
                    assetId = sourceNode.data.asset?.id || '';
                } else if (isFirstLastFrame) {
                    if (edge.sourceHandle === 'source-start') {
                        assetName = '首帧';
                        assetId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    } else {
                        assetName = '尾帧';
                        assetId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    }
                } else if (sourceNode.type === 'sceneRef') {
                    const sceneObj = sourceNode.data.scene;
                    const optId = sourceNode.data.optionId;
                    assetName = optId ? `分镜${sceneObj.id}-${optId}` : `分镜${sceneObj.id}`;
                    assetId = optId ? `scene_img_${sceneObj.id}_${optId}` : `scene_img_${sceneObj.id}`;
                }
                if (assetName && assetId) {
                    imageTags.push(`[@图像_${assetName}#${assetId}]`);
                }
            });

            const videoEdges = restoredEdges.filter(e => e.target === 'video-prompt');
            const videoTags: string[] = [];
            videoEdges.forEach(edge => {
                const sourceNode = restoredNodes.find(n => n.id === edge.source);
                if (!sourceNode) return;
                const isAsset = sourceNode.type === 'asset';
                const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
                let assetName = '';
                let assetId = '';
                if (isAsset) {
                    assetName = sourceNode.data.asset?.name || '';
                    assetId = sourceNode.data.asset?.id || '';
                } else if (isFirstLastFrame) {
                    if (edge.sourceHandle === 'source-start') {
                        assetName = '首帧';
                        assetId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    } else {
                        assetName = '尾帧';
                        assetId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    }
                } else if (sourceNode.type === 'sceneRef') {
                    const sceneObj = sourceNode.data.scene;
                    const optId = sourceNode.data.optionId;
                    assetName = optId ? `分镜${sceneObj.id}-${optId}` : `分镜${sceneObj.id}`;
                    assetId = optId ? `scene_img_${sceneObj.id}_${optId}` : `scene_img_${sceneObj.id}`;
                }
                if (assetName && assetId) {
                    videoTags.push(`[@图像_${assetName}#${assetId}]`);
                }
            });

            const option = getOptionData(activeOption);
            let currentNpPrompt = option.np_prompt || '';
            let currentVideoPrompt = option.video_prompt || '';

            const npTagsInText = extractAssetTags(currentNpPrompt);
            npTagsInText.forEach(tag => {
                const tagStr = `[@图像_${tag.name}#${tag.id}]`;
                if (!imageTags.includes(tagStr)) {
                    currentNpPrompt = currentNpPrompt.replace(tagStr, '').replace(/\s+/g, ' ').trim();
                }
            });
            imageTags.forEach(tagStr => {
                if (!currentNpPrompt.includes(tagStr)) {
                    currentNpPrompt = currentNpPrompt ? `${currentNpPrompt} ${tagStr}` : tagStr;
                }
            });

            const videoTagsInText = extractAssetTags(currentVideoPrompt);
            videoTagsInText.forEach(tag => {
                const tagStr = `[@图像_${tag.name}#${tag.id}]`;
                if (!videoTags.includes(tagStr)) {
                    currentVideoPrompt = currentVideoPrompt.replace(tagStr, '').replace(/\s+/g, ' ').trim();
                }
            });
            videoTags.forEach(tagStr => {
                if (!currentVideoPrompt.includes(tagStr)) {
                    currentVideoPrompt = currentVideoPrompt ? `${currentVideoPrompt} ${tagStr}` : tagStr;
                }
            });

            if (currentNpPrompt !== option.np_prompt || currentVideoPrompt !== option.video_prompt) {
                onSceneUpdate(scene.id, (prev) => {
                    const options = prev.prompt_options ? [...prev.prompt_options] : [];
                    let optIdx = options.findIndex(o => o.option_id === activeOption);
                    const updatedFields: any = {};
                    if (currentNpPrompt !== option.np_prompt) updatedFields.np_prompt = currentNpPrompt;
                    if (currentVideoPrompt !== option.video_prompt) updatedFields.video_prompt = currentVideoPrompt;

                    if (optIdx !== -1) {
                        options[optIdx] = {
                            ...options[optIdx],
                            ...updatedFields
                        };
                    }
                    const updates: Partial<Scene> = { prompt_options: options };
                    if (activeOption === 'A') {
                        if (currentNpPrompt !== option.np_prompt) updates.np_prompt = currentNpPrompt;
                        if (currentVideoPrompt !== option.video_prompt) updates.video_prompt = currentVideoPrompt;
                    }
                    return updates;
                });
            }
        }, [activeOption, scene.id, onSceneUpdate, getOptionData]),
        pendingSaveRef,
        debouncedSaveLayout,
    });

    const { copyNodes, cutNodes, pasteNodes } = useCanvasClipboard({
        latestNodesRef,
        latestEdgesRef,
        setNodes,
        setEdges,
        takeHistorySnapshot,
        pendingSaveRef,
        debouncedSaveLayout,
    });

    useCanvasShortcuts({
        undo,
        redo,
        copyNodes,
        cutNodes,
        pasteNodes,
    });

    const onNodeDragStart = useCallback(() => {
        takeHistorySnapshot();
    }, [takeHistorySnapshot]);

    const handleUpdateNote = useCallback((noteId: string, field: string, value: any) => {
        takeHistorySnapshot();
        setNodes(nds => nds.map(n => {
            if (n.id === noteId) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        [field]: value
                    }
                };
            }
            return n;
        }));
        pendingSaveRef.current = true;
        setTimeout(() => {
            handleSaveLayout();
        }, 100);
    }, [setNodes, handleSaveLayout, takeHistorySnapshot]);

    const handleDeleteNote = useCallback((noteId: string) => {
        takeHistorySnapshot();
        setNodes(nds => nds.filter(n => n.id !== noteId));
        setEdges(eds => eds.filter(e => e.source !== noteId && e.target !== noteId));
        pendingSaveRef.current = true;
        setTimeout(() => {
            handleSaveLayout();
        }, 100);
    }, [setNodes, setEdges, handleSaveLayout, takeHistorySnapshot]);

    const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
        if (!reactFlowInstance) return;

        takeHistorySnapshot();
        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const newNoteId = `custom-note-${Date.now()}`;
        const newNote: Node = {
            id: newNoteId,
            type: 'customNote',
            position,
            data: {
                text: '双击编辑此便签...',
                color: 'yellow',
                onUpdate: (f: string, v: any) => handleUpdateNote(newNoteId, f, v),
                onDelete: () => handleDeleteNote(newNoteId)
            }
        };

        setNodes(nds => [...nds, newNote]);
        pendingSaveRef.current = true;
        setTimeout(() => {
            handleSaveLayout();
        }, 100);
    }, [reactFlowInstance, setNodes, handleUpdateNote, handleDeleteNote, handleSaveLayout, takeHistorySnapshot]);

    const handleResetLayout = useCallback(() => {
        takeHistorySnapshot();
        setNodes(currentNodes => {
            const customNotes = currentNodes.filter(n => n.type === 'customNote').map(n => n.id);

            let imageInputIdx = 0;
            let videoInputIdx = 0;

            const updatedNodes = currentNodes.map((node) => {
                const updatedNode = { ...node };

                if (node.id === 'image-prompt') {
                    updatedNode.position = { x: 330, y: 50 };
                } else if (node.id === 'image-output') {
                    updatedNode.position = { x: 740, y: 220 };
                } else if (node.id === 'audio') {
                    updatedNode.position = { x: 330, y: 460 };
                } else if (node.id === 'video-prompt') {
                    updatedNode.position = { x: 330, y: 800 };
                } else if (node.id === 'video-output') {
                    updatedNode.position = { x: 740, y: 970 };
                } else if (node.type === 'sceneRef' || node.type === 'asset') {
                    const isConnectedToImage = edges.some(e => e.source === node.id && e.target === 'image-prompt');
                    const isConnectedToVideo = edges.some(e => e.source === node.id && e.target === 'video-prompt');

                    if (isConnectedToVideo && !isConnectedToImage) {
                        updatedNode.position = { x: 80, y: 950 + (videoInputIdx++) * 160 };
                    } else {
                        updatedNode.position = { x: 80, y: 200 + (imageInputIdx++) * 160 };
                    }
                } else if (node.type === 'firstLastFrame') {
                    updatedNode.position = { x: 740, y: 720 };
                } else if (node.type === 'customNote') {
                    const idx = customNotes.indexOf(node.id);
                    updatedNode.position = { x: 1970, y: 100 + idx * 250 };
                }

                return updatedNode;
            });

            latestNodesRef.current = updatedNodes;
            return updatedNodes;
        });

        setEdges(currentEdges => {
            const nextEdges = [...currentEdges];
            let changed = false;

            const hasImagePrompt = latestNodesRef.current.some(n => n.id === 'image-prompt');
            const hasImageOutput = latestNodesRef.current.some(n => n.id === 'image-output');
            if (hasImagePrompt && hasImageOutput) {
                const hasEdge = nextEdges.some(e => e.source === 'image-prompt' && e.target === 'image-output');
                if (!hasEdge) {
                    nextEdges.push({
                        id: 'edge_prompt_to_output',
                        source: 'image-prompt',
                        target: 'image-output',
                        animated: true,
                        style: { stroke: '#ec4899', strokeWidth: 2 }
                    });
                    changed = true;
                }
            }

            const hasVideoPrompt = latestNodesRef.current.some(n => n.id === 'video-prompt');
            const hasVideoOutput = latestNodesRef.current.some(n => n.id === 'video-output');
            if (hasVideoPrompt && hasVideoOutput) {
                const hasEdge = nextEdges.some(e => e.source === 'video-prompt' && e.target === 'video-output');
                if (!hasEdge) {
                    nextEdges.push({
                        id: 'edge_video_prompt_to_video_output',
                        source: 'video-prompt',
                        target: 'video-output',
                        animated: true,
                        style: { stroke: '#a855f7', strokeWidth: 2 }
                    });
                    changed = true;
                }
            }

            if (changed) {
                latestEdgesRef.current = nextEdges;
                return nextEdges;
            }
            return currentEdges;
        });

        pendingSaveRef.current = true;

        window.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: "画布排版已重置为标准树状布局！", type: 'success' }
        }));
    }, [edges, setNodes, setEdges, takeHistorySnapshot]);

    const handleExtractFirstLastFrame = useCallback(async (nodeId: string, timeType: 'start' | 'end') => {
        const latestNodes = latestNodesRef.current;
        const latestEdges = latestEdgesRef.current;
        const node = latestNodes.find(n => n.id === nodeId);
        if (!node) {
            console.warn(`Node ${nodeId} not found`);
            return;
        }

        const incomingEdge = latestEdges.find(e => e.target === nodeId && e.targetHandle === 'target-video');
        if (!incomingEdge) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "未连接上游视频源，请先连接视频源",
                    type: 'warning'
                }
            }));
            return;
        }

        const sourceNode = latestNodes.find(n => n.id === incomingEdge.source);
        if (!sourceNode) return;

        const videoUrl = sourceNode.data?.videoUrl;
        const videoAssetId = sourceNode.data?.videoAssetId;

        if (!videoUrl) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: "没有找到可供提取的视频",
                    type: 'warning'
                }
            }));
            return;
        }

        try {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: `正在提取视频${timeType === 'start' ? '首帧' : '尾帧'}...`,
                    type: 'info'
                }
            }));

            let resolvedUrl = videoUrl;
            if (videoAssetId) {
                const dbUrl = await loadAssetUrl(videoAssetId);
                if (dbUrl) {
                    resolvedUrl = dbUrl;
                }
            }

            const blob = await extractVideoFrame(resolvedUrl, timeType);
            const assetId = await saveAsset(blob);
            const objectUrl = URL.createObjectURL(blob);

            setNodes(nds => nds.map(n => {
                if (n.id === nodeId) {
                    const updates = timeType === 'start' ? {
                        startImageUrl: objectUrl,
                        startImageAssetId: assetId
                    } : {
                        endImageUrl: objectUrl,
                        endImageAssetId: assetId
                    };
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            ...updates
                        }
                    };
                }
                return n;
            }));

            pendingSaveRef.current = true;

            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: `成功提取并保存${timeType === 'start' ? '首帧' : '尾帧'}！`,
                    type: 'success'
                }
            }));
        } catch (err: any) {
            console.error("Frame extraction error:", err);
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: {
                    message: `提取${timeType === 'start' ? '首帧' : '尾帧'}失败: ${err.message || err}`,
                    type: 'warning'
                }
            }));
        }
    }, [setNodes]);

    // 分镜引用解析
    const [sceneImages, setSceneImages] = useState<any[]>([]);

    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            const list: any[] = [];
            for (const s of allScenes) {
                let hasOptions = false;
                if (s.prompt_options && s.prompt_options.length > 0) {
                    for (const opt of s.prompt_options) {
                        if (opt.imageUrl || opt.imageAssetId) {
                            hasOptions = true;
                            let url = opt.imageUrl;
                            if (!url && opt.imageAssetId) {
                                url = await loadAssetBase64(opt.imageAssetId) || undefined;
                            }
                            list.push({
                                id: `scene_img_${s.id}_${opt.option_id}`,
                                name: `分镜${s.id}-${opt.option_id}`,
                                refImageUrl: url
                            });
                        }
                    }
                }
                if (!hasOptions && (s.imageUrl || s.imageAssetId)) {
                    let url = s.imageUrl;
                    if (!url && s.imageAssetId) {
                        url = await loadAssetBase64(s.imageAssetId) || undefined;
                    }
                    list.push({
                        id: `scene_img_${s.id}`,
                        name: `分镜${s.id}`,
                        refImageUrl: url
                    });
                }
            }
            if (!cancelled) {
                setSceneImages(list);
            }
        };
        resolve();
        return () => {
            cancelled = true;
        };
    }, [allScenes]);

    // 更新配置字段
    const updateOptionField = (field: string, value: any) => {
        setNodes(nds => nds.map(node => {
            if (node.id === 'image-prompt' && ['np_prompt', 'camera', 'lens', 'focal_length', 'aperture', 'imageModel', 'imageSize', 'imageQuality'].includes(field)) {
                return { ...node, data: { ...node.data, [field]: value } };
            }
            if (node.id === 'video-prompt' && ['video_prompt', 'videoModel', 'refImageMode', 'audio_sfx', 'audio_bgm'].includes(field)) {
                return { ...node, data: { ...node.data, [field]: value } };
            }
            return node;
        }));

        onSceneUpdate(scene.id, (prev) => {
            if (field === 'audio_sfx' || field === 'audio_bgm') {
                return { [field]: value };
            }
            const options = prev.prompt_options ? [...prev.prompt_options] : [];
            let optIdx = options.findIndex(o => o.option_id === activeOption);

            if (optIdx === -1) {
                options.push({
                    option_id: activeOption,
                    lens_reference: { shot_name: '', description: '', searchKeyword: '', video_url: '', timestamp: '' },
                    np_prompt: prev.np_prompt || '',
                    video_prompt: prev.video_prompt || '',
                });
                optIdx = options.length - 1;
            }

            const updatedOption = {
                ...options[optIdx],
                [field]: value
            };

            if (field === 'np_prompt') {
                const tags = extractAssetTags(value || '');
                const ids = tags.map(t => t.id).filter(Boolean) as string[];
                updatedOption.assetIds = ids;
            } else if (field === 'video_prompt') {
                const tags = extractAssetTags(value || '');
                const ids = tags.map(t => t.id).filter(Boolean) as string[];
                updatedOption.videoAssetIds = ids;
            }

            options[optIdx] = updatedOption;

            const rootUpdates: any = { prompt_options: options };
            if (activeOption === 'A') {
                rootUpdates[field] = value;
                if (field === 'np_prompt') {
                    rootUpdates.assetIds = updatedOption.assetIds;
                } else if (field === 'video_prompt') {
                    rootUpdates.videoAssetIds = updatedOption.videoAssetIds;
                }
            }

            return rootUpdates;
        });

        if (field === 'np_prompt') {
            const currentVideoPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
            syncPromptsToCanvasWrapper(value || '', currentVideoPrompt);
        } else if (field === 'video_prompt') {
            const currentNpPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
            syncPromptsToCanvasWrapper(currentNpPrompt, value || '');
        }

        pendingSaveRef.current = true;
    };

    const getConnectedImagesForNode = useCallback((nodeId: string) => {
        const incomingEdges = edges.filter(e => e.target === nodeId);
        const resolved: Array<{ nodeId: string; url: string; assetId?: string; name: string }> = [];

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            let url = '';
            let assetId = '';
            let name = '';

            if (sourceNode.type === 'sceneRef') {
                const sceneObj = sourceNode.data.scene;
                const optId = sourceNode.data.optionId || 'A';
                const option = optId && sceneObj.prompt_options ? sceneObj.prompt_options.find((o: any) => o.option_id === optId) : null;
                url = option ? option.imageUrl : sceneObj.imageUrl;
                assetId = option ? option.imageAssetId : sceneObj.imageAssetId;
                name = optId ? `分镜 ${sceneObj.id}-${optId}` : `分镜 ${sceneObj.id}`;
            } else if (sourceNode.id.startsWith('image-output')) {
                url = sourceNode.data.imageUrl;
                assetId = sourceNode.data.imageAssetId;
                name = `主图`;
            } else if (sourceNode.type === 'asset') {
                url = sourceNode.data.asset.refImageUrl;
                assetId = sourceNode.data.asset.refImageAssetId;
                name = sourceNode.data.asset.name;
            } else if (sourceNode.type === 'firstLastFrame') {
                if (edge.sourceHandle === 'source-start') {
                    url = sourceNode.data.startImageUrl || '';
                    assetId = sourceNode.data.startImageAssetId || '';
                    name = '首帧';
                } else if (edge.sourceHandle === 'source-end') {
                    url = sourceNode.data.endImageUrl || '';
                    assetId = sourceNode.data.endImageAssetId || '';
                    name = '尾帧';
                }
            }

            resolved.push({
                nodeId: sourceNode.id,
                url: url || '',
                assetId: assetId || undefined,
                name
            });
        });

        return resolved;
    }, [edges, nodes]);

    const handleDisconnectImage = useCallback((videoNodeId: string, sourceNodeId: string, name?: string) => {
        takeHistorySnapshot();

        const sourceNode = latestNodesRef.current.find(n => n.id === sourceNodeId);
        if (sourceNode) {
            const isAsset = sourceNode.type === 'asset';
            const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
            const sceneObj = sourceNode.data.scene;
            const assetName = isAsset ? sourceNode.data.asset.name : `分镜${sceneObj?.id}`;
            const assetId = isAsset ? sourceNode.data.asset.id : `scene_img_${sceneObj?.id}`;

            if (videoNodeId.startsWith('image-prompt')) {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    if (name === '首帧') {
                        cleanRegex = new RegExp(`\\[@图像_(首帧)#(?:${startId}|first_frame_${sourceNode.id})\\]`, 'g');
                    } else if (name === '尾帧') {
                        cleanRegex = new RegExp(`\\[@图像_(尾帧)#(?:${endId}|last_frame_${sourceNode.id})\\]`, 'g');
                    } else {
                        cleanRegex = new RegExp(`\\[@图像_(首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                    }
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('np_prompt', newPrompt);
            } else if (videoNodeId.startsWith('video-prompt')) {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    if (name === '首帧') {
                        cleanRegex = new RegExp(`\\[@图像_(首帧)#(?:${startId}|first_frame_${sourceNode.id})\\]`, 'g');
                    } else if (name === '尾帧') {
                        cleanRegex = new RegExp(`\\[@图像_(尾帧)#(?:${endId}|last_frame_${sourceNode.id})\\]`, 'g');
                    } else {
                        cleanRegex = new RegExp(`\\[@图像_(首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                    }
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('video_prompt', newPrompt);
            }
        }

        setEdges((eds) => eds.filter(e => {
            const matchesSourceAndTarget = e.source === sourceNodeId && e.target === videoNodeId;
            if (!matchesSourceAndTarget) return true;
            if (name === '首帧') return e.sourceHandle !== 'source-start';
            if (name === '尾帧') return e.sourceHandle !== 'source-end';
            return false;
        }));
        pendingSaveRef.current = true;
    }, [setEdges, takeHistorySnapshot, activeOption, scene, updateOptionField]);

    const syncPromptsToCanvasWrapper = useCallback((npPrompt: string, videoPrompt: string) => {
        if (!reactFlowInstance) return;
        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        const { nextNodes, nextEdges, changedNodes, changedEdges } = computePromptsSyncToCanvas({
            npPrompt,
            videoPrompt,
            nodes: currentNodes,
            edges: currentEdges,
            allScenes,
            assets,
            activeOption,
            onExtractFirstLastFrame: (nodeId, timeType) => handleExtractFirstLastFrame(nodeId, timeType)
        });

        if (changedNodes) {
            setNodes(nextNodes);
        }
        if (changedEdges) {
            setEdges(nextEdges);
        }
        if (changedNodes || changedEdges) {
            pendingSaveRef.current = true;
            setTimeout(() => {
                handleSaveLayout();
            }, 100);
        }
    }, [reactFlowInstance, allScenes, assets, activeOption, setNodes, setEdges, handleSaveLayout, handleExtractFirstLastFrame]);

    const handleConnect = useCallback((connection: Connection) => {
        takeHistorySnapshot();
        const isPromptNode = connection.source?.startsWith('image-prompt') || connection.source?.startsWith('video-prompt');

        setEdges((eds) => {
            let currentEdges = eds;
            if (isPromptNode && connection.sourceHandle === 'source') {
                currentEdges = eds.filter(e => !(e.source === connection.source && e.sourceHandle === 'source'));
            }
            return addEdge({
                ...connection,
                animated: true,
                style: {
                    stroke: (connection.target === 'image-prompt') ? '#06b6d4' : '#a855f7',
                    strokeWidth: 2
                }
            } as any, currentEdges);
        });

        const sourceNode = nodes.find(n => n.id === connection.source);
        if (!sourceNode) return;

        if (sourceNode.type !== 'asset' && sourceNode.type !== 'sceneRef' && sourceNode.type !== 'firstLastFrame') {
            return;
        }

        const isAsset = sourceNode.type === 'asset';
        const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
        let assetName = '';
        let assetId = '';

        if (isAsset) {
            assetName = sourceNode.data.asset.name;
            assetId = sourceNode.data.asset.id;
        } else if (isFirstLastFrame) {
            if (connection.sourceHandle === 'source-start') {
                assetName = '首帧';
                assetId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
            } else {
                assetName = '尾帧';
                assetId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
            }
        } else {
            const sceneObj = sourceNode.data.scene;
            sourceNode.data.optionId = activeOption;
            assetName = `分镜${sceneObj.id}-${activeOption}`;
            assetId = `scene_img_${sceneObj.id}_${activeOption}`;
        }
        const tag = `[@图像_${assetName}#${assetId}]`;

        if (connection.target === 'image-prompt') {
            const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
            if (!currentPrompt.includes(tag)) {
                const newPrompt = currentPrompt ? `${currentPrompt} ${tag}` : tag;
                updateOptionField('np_prompt', newPrompt);
            }
        } else if (connection.target === 'video-prompt') {
            const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
            if (!currentPrompt.includes(tag)) {
                const newPrompt = currentPrompt ? `${currentPrompt} ${tag}` : tag;
                updateOptionField('video_prompt', newPrompt);
            }
        }

        pendingSaveRef.current = true;
    }, [nodes, activeOption, scene, takeHistorySnapshot, updateOptionField, setEdges]);

    const handleEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
        takeHistorySnapshot();
        edgesToDelete.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            if (sourceNode.type !== 'asset' && sourceNode.type !== 'sceneRef' && sourceNode.type !== 'firstLastFrame') {
                return;
            }

            const isAsset = sourceNode.type === 'asset';
            const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
            const sceneObj = sourceNode.data.scene;
            const assetName = isAsset ? sourceNode.data.asset.name : `分镜${sceneObj?.id}`;
            const assetId = isAsset ? sourceNode.data.asset.id : `scene_img_${sceneObj?.id}`;

            if (edge.target === 'image-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(${edge.sourceHandle === 'source-start' ? '首帧' : '尾帧'})#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('np_prompt', newPrompt);
            } else if (edge.target === 'video-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(${edge.sourceHandle === 'source-start' ? '首帧' : '尾帧'})#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('video_prompt', newPrompt);
            }
        });

        pendingSaveRef.current = true;
    }, [nodes, activeOption, scene, takeHistorySnapshot, updateOptionField]);

    const handleNodesDelete = useCallback((nodesToDelete: Node[]) => {
        takeHistorySnapshot();
        const outgoingEdges = edges.filter(e => nodesToDelete.some(n => n.id === e.source));

        outgoingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            if (sourceNode.type !== 'asset' && sourceNode.type !== 'sceneRef' && sourceNode.type !== 'firstLastFrame') {
                return;
            }

            const isAsset = sourceNode.type === 'asset';
            const isFirstLastFrame = sourceNode.type === 'firstLastFrame';
            const sceneObj = sourceNode.data.scene;
            const assetName = isAsset ? sourceNode.data.asset.name : `分镜${sceneObj?.id}`;
            const assetId = isAsset ? sourceNode.data.asset.id : `scene_img_${sceneObj?.id}`;

            if (edge.target === 'image-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(${edge.sourceHandle === 'source-start' ? '首帧' : '尾帧'})#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('np_prompt', newPrompt);
            } else if (edge.target === 'video-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_(${assetName})#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(${edge.sourceHandle === 'source-start' ? '首帧' : '尾帧'})#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_(分镜${sceneObj.id})(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '$1').replace(/\s+/g, ' ').trim();
                updateOptionField('video_prompt', newPrompt);
            }
        });

        pendingSaveRef.current = true;
    }, [nodes, edges, activeOption, scene, takeHistorySnapshot, updateOptionField]);

    // 监控画布连线，同步到 DB
    useEffect(() => {
        if (!isOpen) return;

        const incomingEdges = edges.filter(e => e.target === 'video-prompt');
        const imageAssetIds: string[] = [];

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (sourceNode) {
                if (sourceNode.type === 'sceneRef') {
                    const sceneObj = sourceNode.data.scene;
                    const optId = sourceNode.data.optionId || activeOption || 'A';
                    imageAssetIds.push(`scene_img_${sceneObj.id}_${optId}`);
                } else if (sourceNode.id === 'image-output') {
                    const optId = activeOption || 'A';
                    imageAssetIds.push(`scene_img_${scene.id}_${optId}`);
                } else if (sourceNode.type === 'asset') {
                    imageAssetIds.push(sourceNode.data.asset.id);
                }
            }
        });

        const uniqueIds = Array.from(new Set(imageAssetIds));
        const firstLastNode = nodes.find(n => n.type === 'firstLastFrame');
        const customStartId = firstLastNode?.data?.startImageAssetId;
        const customEndId = firstLastNode?.data?.endImageAssetId;

        if (scene.isStartEndFrameMode) {
            const currentSceneImgId = `scene_img_${scene.id}_${activeOption || 'A'}`;
            const endFrameId = customEndId || uniqueIds.find(id => id !== currentSceneImgId && id !== `scene_img_${scene.id}`);

            const newStartEndAssetIds = [
                customStartId || currentSceneImgId
            ];
            if (endFrameId) {
                newStartEndAssetIds.push(endFrameId);
            }

            if (JSON.stringify(newStartEndAssetIds) !== JSON.stringify(scene.startEndAssetIds || [])) {
                onSceneUpdate(scene.id, { startEndAssetIds: newStartEndAssetIds });
                pendingSaveRef.current = true;
            }
        } else {
            const videoPromptNode = nodes.find(n => n.id === 'video-prompt');
            const localVideoPrompt = videoPromptNode?.data?.video_prompt || '';
            const localTags = extractAssetTags(localVideoPrompt);
            const localVideoAssetIds = localTags.map(t => t.id).filter(Boolean) as string[];

            const localVideoAssetIdsFiltered = localVideoAssetIds.filter(id => id !== customStartId && id !== customEndId);
            const uniqueIdsFiltered = uniqueIds.filter(id => id !== customStartId && id !== customEndId);

            const deletedIdsInText = uniqueIdsFiltered.filter(id => !localVideoAssetIdsFiltered.includes(id));
            if (deletedIdsInText.length > 0) {
                setEdges(eds => eds.filter(e => {
                    if (e.target === 'video-prompt') {
                        const sourceNode = nodes.find(n => n.id === e.source);
                        if (sourceNode) {
                            let id = '';
                            if (sourceNode.type === 'sceneRef') {
                                const sceneObj = sourceNode.data.scene;
                                const optId = sourceNode.data.optionId || activeOption || 'A';
                                id = `scene_img_${sceneObj.id}_${optId}`;
                            } else if (sourceNode.id === 'image-output') {
                                const optId = activeOption || 'A';
                                id = `scene_img_${scene.id}_${optId}`;
                            } else if (sourceNode.type === 'asset') {
                                id = sourceNode.data.asset.id;
                            }
                            if (deletedIdsInText.includes(id)) {
                                return false;
                            }
                        }
                    }
                    return true;
                }));
                return;
            }

            const addedIdsInText = localVideoAssetIdsFiltered.filter(id => !uniqueIdsFiltered.includes(id));
            if (addedIdsInText.length > 0) {
                return;
            }

            const currentOptionData = getOptionData(activeOption);
            const dbVideoAssetIds = currentOptionData?.videoAssetIds || [];

            const finalAssetIds = [...uniqueIds];
            if (customStartId) finalAssetIds.push(customStartId);
            if (customEndId) finalAssetIds.push(customEndId);
            const finalUniqueIds = Array.from(new Set(finalAssetIds));

            if (JSON.stringify(finalUniqueIds) !== JSON.stringify(dbVideoAssetIds)) {
                onSceneUpdate(scene.id, (prev) => {
                    const options = prev.prompt_options ? [...prev.prompt_options] : [];
                    let optIdx = options.findIndex(o => o.option_id === activeOption);
                    if (optIdx !== -1) {
                        options[optIdx] = {
                            ...options[optIdx],
                            videoAssetIds: finalUniqueIds
                        };
                    }
                    const updates: Partial<Scene> = { prompt_options: options };
                    if (activeOption === 'A') {
                        updates.videoAssetIds = finalUniqueIds;
                    }
                    return updates;
                });
                pendingSaveRef.current = true;
            }
        }
    }, [edges, nodes, scene.isStartEndFrameMode, activeOption, scene.id, scene.startEndAssetIds, scene.videoAssetIds, isOpen, onSceneUpdate, getOptionData, setEdges]);

    // 监控画布连线，同步到 DB (image-prompt)
    useEffect(() => {
        if (!isOpen) return;

        const incomingEdges = edges.filter(e => e.target === 'image-prompt');
        const imageAssetIds: string[] = [];

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (sourceNode) {
                if (sourceNode.type === 'sceneRef') {
                    const sceneObj = sourceNode.data.scene;
                    const optId = sourceNode.data.optionId || activeOption || 'A';
                    imageAssetIds.push(`scene_img_${sceneObj.id}_${optId}`);
                } else if (sourceNode.type === 'asset') {
                    imageAssetIds.push(sourceNode.data.asset.id);
                }
            }
        });

        const uniqueIds = Array.from(new Set(imageAssetIds));

        const imagePromptNode = nodes.find(n => n.id === 'image-prompt');
        const localNpPrompt = imagePromptNode?.data?.np_prompt || '';
        const localTags = extractAssetTags(localNpPrompt);
        const localAssetIds = localTags.map(t => t.id).filter(Boolean) as string[];

        const deletedIdsInText = uniqueIds.filter(id => !localAssetIds.includes(id));
        if (deletedIdsInText.length > 0) {
            setEdges(eds => eds.filter(e => {
                if (e.target === 'image-prompt') {
                    const sourceNode = nodes.find(n => n.id === e.source);
                    if (sourceNode) {
                        let id = '';
                        if (sourceNode.type === 'sceneRef') {
                            const sceneObj = sourceNode.data.scene;
                            const optId = sourceNode.data.optionId || activeOption || 'A';
                            id = `scene_img_${sceneObj.id}_${optId}`;
                        } else if (sourceNode.type === 'asset') {
                            id = sourceNode.data.asset.id;
                        }
                        if (deletedIdsInText.includes(id)) {
                            return false;
                        }
                    }
                }
                return true;
            }));
            return;
        }

        const addedIdsInText = localAssetIds.filter(id => !uniqueIds.includes(id));
        if (addedIdsInText.length > 0) {
            return;
        }

        const currentOptionData = getOptionData(activeOption);
        const dbAssetIds = currentOptionData?.assetIds || [];

        if (JSON.stringify(uniqueIds) !== JSON.stringify(dbAssetIds)) {
            onSceneUpdate(scene.id, (prev) => {
                const options = prev.prompt_options ? [...prev.prompt_options] : [];
                let optIdx = options.findIndex(o => o.option_id === activeOption);
                if (optIdx !== -1) {
                    options[optIdx] = {
                        ...options[optIdx],
                        assetIds: uniqueIds
                    };
                }
                const updates: Partial<Scene> = { prompt_options: options };
                if (activeOption === 'A') {
                    updates.assetIds = uniqueIds;
                }
                return updates;
            });
            pendingSaveRef.current = true;
        }
    }, [edges, nodes, activeOption, scene.id, scene.prompt_options, scene.assetIds, isOpen, onSceneUpdate, getOptionData, setEdges]);

    // 自动将上游视频同步进首尾帧节点
    useEffect(() => {
        if (!isOpen) return;

        let changed = false;
        const nextNodes = nodes.map(node => {
            if (node.type === 'firstLastFrame') {
                const incomingEdge = edges.find(e => e.target === node.id && e.targetHandle === 'target-video');
                let resolvedVideoUrl = undefined;
                let resolvedVideoAssetId = undefined;
                if (incomingEdge) {
                    const sourceNode = nodes.find(n => n.id === incomingEdge.source);
                    if (sourceNode) {
                        resolvedVideoUrl = sourceNode.data?.videoUrl;
                        resolvedVideoAssetId = sourceNode.data?.videoAssetId;
                    }
                }

                if (node.data.videoUrl !== resolvedVideoUrl || node.data.videoAssetId !== resolvedVideoAssetId) {
                    changed = true;
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            videoUrl: resolvedVideoUrl,
                            videoAssetId: resolvedVideoAssetId
                        }
                    };
                }
            }
            return node;
        });

        if (changed) {
            setNodes(nextNodes);
            pendingSaveRef.current = true;
        }
    }, [edges, nodes, isOpen, setNodes]);

    // 加载画布布局或创建默认排版
    const loadLayout = useCallback(() => {
        const savedLayout = scene.canvas?.[activeOption];
        const option = getOptionData(activeOption);

        const imageTags = extractAssetTags(option.np_prompt || '');
        const imageReferencedIds = getReferencedIdsFromTags(imageTags, allScenes, assets);

        const videoTags = extractAssetTags(option.video_prompt || '');
        const videoReferencedIds = getReferencedIdsFromTags(videoTags, allScenes, assets);

        if (savedLayout && savedLayout.nodes && savedLayout.nodes.length > 0) {
            let needsMigration = false;
            const videoPromptNode = savedLayout.nodes.find((n: any) => n.id === 'video-prompt');
            if (videoPromptNode && videoPromptNode.position.y < 800) {
                needsMigration = true;
                pendingSaveRef.current = true;
            }

            let imageRefIdx = 0;
            let videoRefIdx = 0;

            const uniqueNodesMap = new Map<string, any>();
            savedLayout.nodes.forEach((n: any) => {
                if (n && n.id) uniqueNodesMap.set(n.id, n);
            });
            const uniqueNodes = Array.from(uniqueNodesMap.values());

            const allReferencedAssetIds = Array.from(new Set([
                ...imageReferencedIds,
                ...videoReferencedIds
            ]));

            const filteredSavedNodes = uniqueNodes.filter((node: any) => {
                if (node.id === 'audio') {
                    needsMigration = true;
                    return false;
                }
                if (['image-prompt', 'image-output', 'video-prompt', 'video-output'].includes(node.id)) {
                    return true;
                }
                if (node.type === 'asset') {
                    const assetId = node.data?.asset?.id;
                    return assets.some(a => a.id === assetId);
                }
                if (node.type === 'sceneRef') {
                    const sceneId = node.data?.scene?.id;
                    return allScenes.some(s => s.id === sceneId);
                }
                return true;
            });

            const boundNodes = filteredSavedNodes.map((node: any) => {
                const updatedNode = { ...node };

                if (needsMigration) {
                    if (node.id === 'image-prompt') {
                        updatedNode.position = { x: 330, y: 50 };
                    } else if (node.id === 'image-output') {
                        updatedNode.position = { x: 740, y: 220 };
                    } else if (node.id === 'video-prompt') {
                        updatedNode.position = { x: 330, y: 800 };
                    } else if (node.id === 'video-output') {
                        updatedNode.position = { x: 740, y: 970 };
                    } else if (node.type === 'sceneRef' || node.type === 'asset') {
                        const isConnectedToImage = (savedLayout.edges || []).some((e: any) => e.source === node.id && e.target === 'image-prompt');
                        const isConnectedToVideo = (savedLayout.edges || []).some((e: any) => e.source === node.id && e.target === 'video-prompt');
                        if (isConnectedToImage) {
                            updatedNode.position = { x: 80, y: 200 + (imageRefIdx++) * 160 };
                        } else if (isConnectedToVideo) {
                            updatedNode.position = { x: 80, y: 950 + (videoRefIdx++) * 160 };
                        } else if (node.position.x === -80) {
                            updatedNode.position = { x: 80, y: 200 + (imageRefIdx++) * 160 };
                        }
                    }
                }

                if (node.id === 'image-prompt') {
                    updatedNode.data = {
                        ...node.data,
                        assets,
                        sceneImages,
                        genStatus: currentGenStatus,
                        onUpdate: (f: string, v: any) => updateOptionField(f, v),
                        onGenerate: () => {
                            setNodes(nds => nds.map(n => {
                                if (n.id === 'image-prompt') {
                                    return { ...n, data: { ...n.data, genStatus: ImageGenStatus.GENERATING } };
                                }
                                return n;
                            }));
                            onGenerateImage(scene, activeOption);
                        },
                        onBlur: () => {
                            const opt = getOptionData(activeOption);
                            syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                        },
                        connectedImages: getConnectedImagesForNode(node.id),
                        onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage(node.id, sourceNodeId, name)
                    };
                } else if (node.id === 'image-output') {
                    updatedNode.data = {
                        ...node.data,
                        genStatus: currentGenStatus,
                        onUpload: (file: File) => onUploadImage(file, activeOption),
                        onDelete: () => onDeleteImage(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'image-output');
                            if (latest?.data?.imageUrl) window.open(latest.data.imageUrl, '_blank');
                        }
                    };
                } else if (node.id === 'video-prompt') {
                    updatedNode.data = {
                        ...node.data,
                        assets,
                        sceneImages,
                        videoStatus: currentVideoStatus,
                        audio_sfx: scene.audio_sfx || '',
                        audio_bgm: scene.audio_bgm || '',
                        onUpdate: (f: string, v: any) => {
                            if (f === 'refImageMode') {
                                onSceneUpdate(scene.id, { isStartEndFrameMode: v === 'start_end_frame' || v === 'first_frame' });
                            }
                            updateOptionField(f, v);
                        },
                        onGenerate: () => {
                            setNodes(nds => nds.map(n => {
                                if (n.id === 'video-prompt') {
                                    return { ...n, data: { ...n.data, videoStatus: ImageGenStatus.GENERATING } };
                                }
                                return n;
                            }));
                            onGenerateVideo(scene, activeOption);
                        },
                        onBlur: () => {
                            const opt = getOptionData(activeOption);
                            syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                        },
                        onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage(node.id, sourceNodeId, name),
                        connectedImages: getConnectedImagesForNode(node.id)
                    };
                } else if (node.id === 'video-output') {
                    updatedNode.data = {
                        ...node.data,
                        videoStatus: currentVideoStatus,
                        onUpload: (file: File) => onUploadVideo(file, activeOption),
                        onDelete: () => onDeleteVideo(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'video-output');
                            if (latest?.data?.videoUrl) window.open(latest.data.videoUrl, '_blank');
                        },
                    };
                } else if (node.type === 'sceneRef' && node.data?.scene?.id) {
                    const matchedScene = allScenes.find(s => s.id === node.data.scene.id);
                    if (matchedScene) {
                        updatedNode.data = {
                            ...node.data,
                            scene: matchedScene
                        };
                    }
                } else if (node.type === 'asset' && node.data?.asset?.id) {
                    const matchedAsset = assets.find(a => a.id === node.data.asset.id);
                    if (matchedAsset) {
                        updatedNode.data = {
                            ...node.data,
                            asset: matchedAsset
                        };
                    }
                } else if (node.type === 'firstLastFrame') {
                    const incomingVideoEdge = (savedLayout.edges || []).find((e: any) => e.target === node.id && e.targetHandle === 'target-video');
                    let resolvedVideoUrl = undefined;
                    let resolvedVideoAssetId = undefined;
                    if (incomingVideoEdge) {
                        const sourceNode = savedLayout.nodes.find((n: any) => n.id === incomingVideoEdge.source);
                        if (sourceNode) {
                            resolvedVideoUrl = sourceNode.data?.videoUrl;
                            resolvedVideoAssetId = sourceNode.data?.videoAssetId;
                        }
                    }

                    updatedNode.data = {
                        ...node.data,
                        videoUrl: resolvedVideoUrl,
                        videoAssetId: resolvedVideoAssetId,
                        onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(node.id, timeType)
                    };
                } else if (node.type === 'customNote') {
                    updatedNode.data = {
                        ...node.data,
                        onUpdate: (f: string, v: any) => handleUpdateNote(node.id, f, v),
                        onDelete: () => handleDeleteNote(node.id)
                    };
                }
                return updatedNode;
            });

            let edgeMigrated = false;
            const uniqueEdgesMap = new Map<string, any>();
            (savedLayout.edges || []).forEach((e: any) => {
                if (e && e.id) uniqueEdgesMap.set(e.id, e);
            });
            const uniqueEdges = Array.from(uniqueEdgesMap.values());

            const cleanedEdges = uniqueEdges.map((e: any) => {
                if (e.target === 'video-prompt') {
                    if (e.targetHandle !== 'target-video-images') {
                        edgeMigrated = true;
                        return { ...e, targetHandle: 'target-video-images' };
                    }
                }
                return e;
            }).filter((e: any) => {
                if (e.source === 'audio' || e.target === 'audio') {
                    edgeMigrated = true;
                    return false;
                }
                if (e.target === 'image-prompt') {
                    const sourceNode = boundNodes.find((n: any) => n.id === e.source);
                    if (sourceNode) {
                        if (sourceNode.type === 'asset' || sourceNode.type === 'sceneRef') {
                            const id = sourceNode.type === 'asset'
                                ? sourceNode.data.asset.id
                                : (() => {
                                    const baseId = `scene_img_${sourceNode.data.scene.id}`;
                                    const foundId = imageReferencedIds.find(rid => rid === baseId || rid.startsWith(`${baseId}_`));
                                    return foundId || baseId;
                                })();
                            return imageReferencedIds.includes(id);
                        }
                        if (sourceNode.type === 'firstLastFrame') {
                            const isStart = e.sourceHandle === 'source-start';
                            const expectedName = isStart ? '首帧' : '尾帧';
                            const fallbackId = isStart ? `first_frame_${sourceNode.id}` : `last_frame_${sourceNode.id}`;
                            const realId = isStart ? sourceNode.data?.startImageAssetId : sourceNode.data?.endImageAssetId;

                            return imageTags.some((tag: any) => {
                                if (tag.name !== expectedName) return false;
                                return tag.id === fallbackId || (realId && tag.id === realId) || !tag.id;
                            });
                        }
                    }
                } else if (e.target === 'video-prompt') {
                    const sourceNode = boundNodes.find((n: any) => n.id === e.source);
                    if (sourceNode) {
                        if (sourceNode.type === 'asset' || sourceNode.type === 'sceneRef') {
                            const id = sourceNode.type === 'asset'
                                ? sourceNode.data.asset.id
                                : (() => {
                                    const baseId = `scene_img_${sourceNode.data.scene.id}`;
                                    const foundId = videoReferencedIds.find(rid => rid === baseId || rid.startsWith(`${baseId}_`));
                                    return foundId || baseId;
                                })();
                            return videoReferencedIds.includes(id);
                        }
                        if (sourceNode.type === 'firstLastFrame') {
                            const isStart = e.sourceHandle === 'source-start';
                            const expectedName = isStart ? '首帧' : '尾帧';
                            const fallbackId = isStart ? `first_frame_${sourceNode.id}` : `last_frame_${sourceNode.id}`;
                            const realId = isStart ? sourceNode.data?.startImageAssetId : sourceNode.data?.endImageAssetId;

                            return videoTags.some((tag: any) => {
                                if (tag.name !== expectedName) return false;
                                return tag.id === fallbackId || (realId && tag.id === realId) || !tag.id;
                            });
                        }
                    }
                }
                return true;
            });

            const hasImagePrompt = boundNodes.some((n: any) => n.id === 'image-prompt');
            const hasImageOutput = boundNodes.some((n: any) => n.id === 'image-output');
            if (hasImagePrompt && hasImageOutput) {
                const hasEdge = cleanedEdges.some((e: any) => e.source === 'image-prompt' && e.target === 'image-output');
                if (!hasEdge) {
                    cleanedEdges.push({
                        id: 'edge_prompt_to_output',
                        source: 'image-prompt',
                        target: 'image-output',
                        animated: true,
                        style: { stroke: '#ec4899', strokeWidth: 2 }
                    });
                    edgeMigrated = true;
                }
            }

            const hasVideoPrompt = boundNodes.some((n: any) => n.id === 'video-prompt');
            const hasVideoOutput = boundNodes.some((n: any) => n.id === 'video-output');
            if (hasVideoPrompt && hasVideoOutput) {
                const hasEdge = cleanedEdges.some((e: any) => e.source === 'video-prompt' && e.target === 'video-output');
                if (!hasEdge) {
                    cleanedEdges.push({
                        id: 'edge_video_prompt_to_video_output',
                        source: 'video-prompt',
                        target: 'video-output',
                        animated: true,
                        style: { stroke: '#a855f7', strokeWidth: 2 }
                    });
                    edgeMigrated = true;
                }
            }

            if (edgeMigrated) {
                pendingSaveRef.current = true;
            }

            let newImageRefIdx2 = boundNodes.filter((n: any) => n.type === 'sceneRef' || n.type === 'asset').length;

            allReferencedAssetIds.forEach((id) => {
                let sourceNodeId = '';
                let nodeType: 'sceneRef' | 'asset' | 'firstLastFrame' | '' = '';
                let sceneObj: any = null;
                let asset: any = null;
                let optId: string | undefined = undefined;

                if (id.startsWith('scene_img_') || id.startsWith('scene_')) {
                    sceneObj = allScenes.find(s =>
                        id === `scene_${s.id}` ||
                        id === `scene_img_${s.id}` ||
                        id.startsWith(`scene_${s.id}_`) ||
                        id.startsWith(`scene_img_${s.id}_`)
                    );
                    if (sceneObj) {
                        sourceNodeId = `scene_${sceneObj.id}`;
                        nodeType = 'sceneRef';
                        const prefix = `scene_img_${sceneObj.id}_`;
                        if (id.startsWith(prefix)) {
                            optId = id.slice(prefix.length);
                        }
                    }
                } else if (id.startsWith('first_frame_') || id.startsWith('last_frame_') || id === 'first-last-frame') {
                    const matchedNode = boundNodes.find((n: any) =>
                        n.type === 'firstLastFrame' && (
                            id.includes(n.id) ||
                            n.data?.startImageAssetId === id ||
                            n.data?.endImageAssetId === id
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
                    asset = assets.find(a => a.id === id);
                    if (asset) {
                        sourceNodeId = `asset_${asset.id}`;
                        nodeType = 'asset';
                    }
                }

                if (!sourceNodeId) return;

                const existingNode = boundNodes.find((n: any) => {
                    if (n.id === sourceNodeId) return true;
                    if (nodeType === 'asset' && n.type === 'asset') {
                        return n.data?.asset?.id === id;
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
                    let nodeY = 200;
                    if (imageReferencedIds.includes(id)) {
                        nodeY = 200 + (newImageRefIdx2++) * 160;
                    } else if (videoReferencedIds.includes(id)) {
                        nodeY = 950 + (newImageRefIdx2++) * 160;
                    } else {
                        nodeY = 200 + (newImageRefIdx2++) * 160;
                    }

                    if (nodeType === 'sceneRef') {
                        boundNodes.push({
                            id: sourceNodeId,
                            type: 'sceneRef',
                            position: { x: 80, y: nodeY },
                            data: {
                                scene: sceneObj,
                                optionId: optId
                            }
                        });
                    } else if (nodeType === 'asset') {
                        boundNodes.push({
                            id: sourceNodeId,
                            type: 'asset',
                            position: { x: 80, y: nodeY },
                            data: { asset }
                        });
                    } else if (nodeType === 'firstLastFrame') {
                        boundNodes.push({
                            id: sourceNodeId,
                            type: 'firstLastFrame',
                            position: { x: 740, y: 720 },
                            data: {
                                onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(sourceNodeId, timeType)
                            }
                        });
                    }
                    pendingSaveRef.current = true;
                }

                if (imageReferencedIds.includes(id)) {
                    const isStart = id.startsWith('first_frame_') || id === 'first-last-frame' || (boundNodes.find(n => n.id === sourceNodeId)?.data?.startImageAssetId === id);
                    const handleId = nodeType === 'firstLastFrame' ? (isStart ? 'source-start' : 'source-end') : undefined;

                    const edgeExists = cleanedEdges.some(e =>
                        e.source === actualSourceId &&
                        e.target === 'image-prompt' &&
                        (!handleId || e.sourceHandle === handleId)
                    );
                    if (!edgeExists) {
                        cleanedEdges.push({
                            id: `edge_${id}_to_image_prompt${handleId ? `_${isStart ? 'start' : 'end'}` : ''}`,
                            source: actualSourceId,
                            sourceHandle: handleId,
                            target: 'image-prompt',
                            animated: true,
                            style: { stroke: '#06b6d4', strokeWidth: 2 }
                        } as any);
                        pendingSaveRef.current = true;
                    }
                }

                if (videoReferencedIds.includes(id)) {
                    const isStart = id.startsWith('first_frame_') || id === 'first-last-frame' || (boundNodes.find(n => n.id === sourceNodeId)?.data?.startImageAssetId === id);
                    const handleId = nodeType === 'firstLastFrame' ? (isStart ? 'source-start' : 'source-end') : undefined;

                    const edgeExists = cleanedEdges.some(e =>
                        e.source === actualSourceId &&
                        e.target === 'video-prompt' &&
                        (!handleId || e.sourceHandle === handleId)
                    );
                    if (!edgeExists) {
                        cleanedEdges.push({
                            id: `edge_${id}_to_video_prompt${handleId ? `_${isStart ? 'start' : 'end'}` : ''}`,
                            source: actualSourceId,
                            sourceHandle: handleId,
                            target: 'video-prompt',
                            targetHandle: 'target-video-images',
                            animated: true,
                            style: { stroke: '#a855f7', strokeWidth: 2 }
                        } as any);
                        pendingSaveRef.current = true;
                    }
                }
            });

            setNodes(boundNodes);
            setEdges(cleanedEdges);
            latestNodesRef.current = boundNodes;
            latestEdgesRef.current = cleanedEdges;
        } else {
            // 构造默认排版
            const defaultNodes: Node[] = [
                {
                    id: 'image-prompt',
                    type: 'imagePrompt',
                    position: { x: 330, y: 50 },
                    data: {
                        np_prompt: option.np_prompt || '',
                        imageModel: option.imageModel || 'gpt-image-2',
                        imageSize: option.imageSize || '16:9',
                        imageQuality: option.imageQuality || 'auto',
                        camera: option.camera || '',
                        lens: option.lens || '',
                        focal_length: option.focal_length || '',
                        aperture: option.aperture || '',
                        genStatus: currentGenStatus,
                        onUpdate: (f: string, v: any) => updateOptionField(f, v),
                        onGenerate: () => {
                            setNodes(nds => nds.map(n => {
                                if (n.id === 'image-prompt') {
                                    return { ...n, data: { ...n.data, genStatus: ImageGenStatus.GENERATING } };
                                }
                                return n;
                            }));
                            onGenerateImage(scene, activeOption);
                        },
                        onBlur: () => {
                            const opt = getOptionData(activeOption);
                            syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                        },
                        assets,
                        sceneImages,
                        connectedImages: getConnectedImagesForNode('image-prompt'),
                        onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage('image-prompt', sourceNodeId, name)
                    }
                },
                {
                    id: 'image-output',
                    type: 'imageOutput',
                    position: { x: 740, y: 220 },
                    data: {
                        imageUrl: option.imageUrl,
                        imageAssetId: option.imageAssetId,
                        genStatus: currentGenStatus,
                        onUpload: (file: File) => onUploadImage(file, activeOption),
                        onDelete: () => onDeleteImage(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'image-output');
                            if (latest?.data?.imageUrl) window.open(latest.data.imageUrl, '_blank');
                        }
                    }
                },
                {
                    id: 'video-prompt',
                    type: 'videoPrompt',
                    position: { x: 330, y: 800 },
                    data: {
                        video_prompt: option.video_prompt || '',
                        videoModel: option.videoModel || 'doubao-seedance-2-0-260128',
                        refImageMode: option.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto'),
                        videoStatus: currentVideoStatus,
                        audio_sfx: scene.audio_sfx || '',
                        audio_bgm: scene.audio_bgm || '',
                        onUpdate: (f: string, v: any) => {
                            if (f === 'refImageMode') {
                                onSceneUpdate(scene.id, { isStartEndFrameMode: v === 'start_end_frame' || v === 'first_frame' });
                            }
                            updateOptionField(f, v);
                        },
                        onGenerate: () => {
                            setNodes(nds => nds.map(n => {
                                if (n.id === 'video-prompt') {
                                    return { ...n, data: { ...n.data, videoStatus: ImageGenStatus.GENERATING } };
                                }
                                return n;
                            }));
                            onGenerateVideo(scene, activeOption);
                        },
                        onBlur: () => {
                            const opt = getOptionData(activeOption);
                            syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                        },
                        onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage('video-prompt', sourceNodeId, name),
                        connectedImages: getConnectedImagesForNode('video-prompt'),
                        assets,
                        sceneImages
                    }
                },
                {
                    id: 'video-output',
                    type: 'videoOutput',
                    position: { x: 740, y: 970 },
                    data: {
                        videoUrl: scene.isStartEndFrameMode ? scene.startEndVideoUrl : option.videoUrl,
                        videoAssetId: scene.isStartEndFrameMode ? scene.startEndVideoAssetId : option.videoAssetId,
                        videoStatus: currentVideoStatus,
                        onUpload: (file: File) => onUploadVideo(file, activeOption),
                        onDelete: () => onDeleteVideo(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'video-output');
                            const url = latest?.data?.videoUrl || option.videoUrl || scene.startEndVideoUrl;
                            if (url) window.open(url, '_blank');
                        }
                    }
                }
            ];

            const defaultEdges: any[] = [
                { id: 'edge_prompt_to_output', source: 'image-prompt', target: 'image-output', animated: true, style: { stroke: '#ec4899', strokeWidth: 2 } },
                { id: 'edge_video_prompt_to_video_output', source: 'video-prompt', target: 'video-output', animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } }
            ];

            const allReferencedAssetIds = Array.from(new Set([
                ...imageReferencedIds,
                ...videoReferencedIds
            ]));

            let imageRefIdx = 0;
            let videoRefIdx = 0;

            allReferencedAssetIds.forEach((id) => {
                if (id.startsWith('scene_img_') || id.startsWith('scene_')) {
                    const sceneObj = allScenes.find(s =>
                        id === `scene_${s.id}` ||
                        id === `scene_img_${s.id}` ||
                        id.startsWith(`scene_${s.id}_`) ||
                        id.startsWith(`scene_img_${s.id}_`)
                    );
                    if (sceneObj) {
                        const nodeId = `scene_${sceneObj.id}`;
                        let optId: string | undefined = undefined;
                        const prefix = `scene_img_${sceneObj.id}_`;
                        if (id.startsWith(prefix)) {
                            optId = id.slice(prefix.length);
                        }

                        let nodeY = 200;
                        if (imageReferencedIds.includes(id)) {
                            nodeY = 200 + (imageRefIdx++) * 160;
                        } else if (videoReferencedIds.includes(id)) {
                            nodeY = 950 + (videoRefIdx++) * 160;
                        } else {
                            nodeY = 200 + (imageRefIdx++) * 160;
                        }

                        if (!defaultNodes.some(n => n.id === nodeId)) {
                            defaultNodes.push({
                                id: nodeId,
                                type: 'sceneRef',
                                position: { x: 80, y: nodeY },
                                data: {
                                    scene: sceneObj,
                                    optionId: optId
                                }
                            });
                        }

                        if (imageReferencedIds.includes(id)) {
                            defaultEdges.push({
                                id: `edge_${id}_to_image_prompt`,
                                source: nodeId,
                                target: 'image-prompt',
                                animated: true,
                                style: { stroke: '#06b6d4', strokeWidth: 2 }
                            });
                        }
                        if (videoReferencedIds.includes(id)) {
                            defaultEdges.push({
                                id: `edge_${id}_to_video_prompt`,
                                source: nodeId,
                                target: 'video-prompt',
                                targetHandle: 'target-video-images',
                                animated: true,
                                style: { stroke: '#a855f7', strokeWidth: 2 }
                            });
                        }
                    }
                } else if (id.startsWith('first_frame_') || id.startsWith('last_frame_') || id === 'first-last-frame') {
                    const nodeId = 'first-last-frame';
                    const isStart = id.startsWith('first_frame_') || id === 'first-last-frame';
                    const handleId = isStart ? 'source-start' : 'source-end';

                    if (!defaultNodes.some(n => n.id === nodeId)) {
                        defaultNodes.push({
                            id: nodeId,
                            type: 'firstLastFrame',
                            position: { x: 740, y: 720 },
                            data: {
                                onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(nodeId, timeType)
                            }
                        });
                    }

                    if (imageReferencedIds.includes(id)) {
                        defaultEdges.push({
                            id: `edge_${id}_to_image_prompt_${isStart ? 'start' : 'end'}`,
                            source: nodeId,
                            sourceHandle: handleId,
                            target: 'image-prompt',
                            animated: true,
                            style: { stroke: '#06b6d4', strokeWidth: 2 }
                        });
                    }
                    if (videoReferencedIds.includes(id)) {
                        defaultEdges.push({
                            id: `edge_${id}_to_video_prompt_${isStart ? 'start' : 'end'}`,
                            source: nodeId,
                            sourceHandle: handleId,
                            target: 'video-prompt',
                            targetHandle: 'target-video-images',
                            animated: true,
                            style: { stroke: '#a855f7', strokeWidth: 2 }
                        });
                    }
                } else {
                    const asset = assets.find(a => a.id === id);
                    if (asset) {
                        const nodeId = `asset_${asset.id}`;

                        let nodeY = 200;
                        if (imageReferencedIds.includes(id)) {
                            nodeY = 200 + (imageRefIdx++) * 160;
                        } else if (videoReferencedIds.includes(id)) {
                            nodeY = 950 + (videoRefIdx++) * 160;
                        } else {
                            nodeY = 200 + (imageRefIdx++) * 160;
                        }

                        if (!defaultNodes.some(n => n.id === nodeId)) {
                            defaultNodes.push({
                                id: nodeId,
                                type: 'asset',
                                position: { x: 80, y: nodeY },
                                data: { asset }
                            });
                        }

                        if (imageReferencedIds.includes(id)) {
                            defaultEdges.push({
                                id: `edge_${asset.id}_to_image_prompt`,
                                source: nodeId,
                                target: 'image-prompt',
                                animated: true,
                                style: { stroke: '#06b6d4', strokeWidth: 2 }
                            });
                        }
                        if (videoReferencedIds.includes(id)) {
                            defaultEdges.push({
                                id: `edge_${asset.id}_to_video_prompt`,
                                source: nodeId,
                                target: 'video-prompt',
                                targetHandle: 'target-video-images',
                                animated: true,
                                style: { stroke: '#a855f7', strokeWidth: 2 }
                            });
                        }
                    }
                }
            });

            setNodes(defaultNodes);
            setEdges(defaultEdges);
            latestNodesRef.current = defaultNodes;
            latestEdgesRef.current = defaultEdges;
        }
    }, [scene, activeOption, assets, sceneImages, currentGenStatus, currentVideoStatus, getOptionData, handleExtractFirstLastFrame, getConnectedImagesForNode, handleDisconnectImage, onGenerateImage, onGenerateVideo, onUploadImage, onUploadVideo, onDeleteImage, onDeleteVideo, onSceneUpdate, setNodes, setEdges, syncPromptsToCanvasWrapper]);

    useEffect(() => {
        if (isOpen && initialOptionId) {
            setActiveOption(initialOptionId as any);
        }
    }, [isOpen, initialOptionId]);

    useEffect(() => {
        if (isOpen) {
            pendingSaveRef.current = false;
            isFirstSyncRef.current = true;
            lastGenStatusRef.current = genStatusMap[activeOption] || ImageGenStatus.IDLE;
            lastVideoStatusRef.current = videoStatusMap[activeOption] || ImageGenStatus.IDLE;
            loadLayout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, activeOption, scene.id]);

    // 从 DB 自动同步后端进度变化 (完成图片生成或视频生成后的节点自刷新)
    useEffect(() => {
        if (!isOpen) return;
        const option = getOptionData(activeOption);

        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        if (currentNodes.length > 0) {
            // 1. 生成完自动生成/链接 image-output 节点
            const imageGenJustCompleted = lastGenStatusRef.current === ImageGenStatus.GENERATING && currentGenStatus !== ImageGenStatus.GENERATING;
            const hasImageInDb = !!option.imageUrl;
            const isFirstSync = isFirstSyncRef.current;
            const missingImageOutput = !currentNodes.some(n => n.id === 'image-output') || !currentEdges.some(e => e.source === 'image-prompt' && e.target === 'image-output');
            const shouldSpawnImage = imageGenJustCompleted || (isFirstSync && hasImageInDb && missingImageOutput);

            if (shouldSpawnImage) {
                const imagePromptNode = currentNodes.find(n => n.id === 'image-prompt');
                const newOutputNode = {
                    id: 'image-output',
                    type: 'imageOutput',
                    position: imagePromptNode
                        ? { x: imagePromptNode.position.x + 410, y: imagePromptNode.position.y + 170 }
                        : { x: 740, y: 220 },
                    data: {
                        imageUrl: option.imageUrl,
                        imageAssetId: option.imageAssetId,
                        genStatus: currentGenStatus,
                        onUpload: (file: File) => onUploadImage(file, activeOption),
                        onDelete: () => onDeleteImage(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'image-output');
                            if (latest?.data?.imageUrl) window.open(latest.data.imageUrl, '_blank');
                        }
                    }
                };
                const newEdge = {
                    id: 'edge_prompt_to_output',
                    source: 'image-prompt',
                    target: 'image-output',
                    animated: true,
                    style: { stroke: '#ec4899', strokeWidth: 2 }
                };

                setNodes(nds => {
                    if (nds.some(n => n.id === 'image-output')) return nds;
                    return [...nds, newOutputNode];
                });
                setEdges(eds => {
                    if (eds.some(e => e.id === 'edge_prompt_to_output')) return eds;
                    return [...eds, newEdge];
                });
                pendingSaveRef.current = true;
            }

            // 2. 生成完自动生成/链接 video-output 节点
            const videoGenJustCompleted = lastVideoStatusRef.current === ImageGenStatus.GENERATING && currentVideoStatus !== ImageGenStatus.GENERATING;
            const resolvedVideoUrl = scene.isStartEndFrameMode ? scene.startEndVideoUrl : option.videoUrl;
            const resolvedVideoAssetId = scene.isStartEndFrameMode ? scene.startEndVideoAssetId : option.videoAssetId;
            const hasVideoInDb = !!resolvedVideoUrl;
            const missingVideoOutput = !currentNodes.some(n => n.id === 'video-output') || !currentEdges.some(e => e.source === 'video-prompt' && e.target === 'video-output');
            const shouldSpawnVideo = videoGenJustCompleted || (isFirstSync && hasVideoInDb && missingVideoOutput);

            if (shouldSpawnVideo) {
                const videoPromptNode = currentNodes.find(n => n.id === 'video-prompt');
                const newOutputNode = {
                    id: 'video-output',
                    type: 'videoOutput',
                    position: videoPromptNode
                        ? { x: videoPromptNode.position.x + 410, y: videoPromptNode.position.y + 170 }
                        : { x: 740, y: 970 },
                    data: {
                        videoUrl: resolvedVideoUrl,
                        videoAssetId: resolvedVideoAssetId,
                        videoStatus: currentVideoStatus,
                        onUpload: (file: File) => onUploadVideo(file, activeOption),
                        onDelete: () => onDeleteVideo(activeOption),
                        onDownload: () => {
                            const latest = latestNodesRef.current.find(x => x.id === 'video-output');
                            if (latest?.data?.videoUrl) window.open(latest.data.videoUrl, '_blank');
                        }
                    }
                };
                const newEdge = {
                    id: 'edge_video_prompt_to_video_output',
                    source: 'video-prompt',
                    target: 'video-output',
                    animated: true,
                    style: { stroke: '#a855f7', strokeWidth: 2 }
                };

                setNodes(nds => {
                    if (nds.some(n => n.id === 'video-output')) return nds;
                    return [...nds, newOutputNode];
                });
                setEdges(eds => {
                    if (eds.some(e => e.id === 'edge_video_prompt_to_video_output')) return eds;
                    return [...eds, newEdge];
                });
                pendingSaveRef.current = true;
            }
        }

        const currentNpPrompt = option.np_prompt || '';
        const currentVideoPrompt = option.video_prompt || '';
        const currentAssetsCount = assets.length;

        const isSwitch = lastSyncRef.current.sceneId !== scene.id || lastSyncRef.current.activeOption !== activeOption;
        const instanceReady = reactFlowInstance && !lastSyncRef.current.instanceInitialized;

        if (!isSwitch) {
            const npPromptChanged = lastSyncRef.current.np_prompt !== currentNpPrompt || lastSyncRef.current.assetsCount !== currentAssetsCount || instanceReady;
            const videoPromptChanged = lastSyncRef.current.video_prompt !== currentVideoPrompt || lastSyncRef.current.assetsCount !== currentAssetsCount || instanceReady;

            if (npPromptChanged || videoPromptChanged) {
                syncPromptsToCanvasWrapper(currentNpPrompt, currentVideoPrompt);
            }
        }

        lastSyncRef.current = {
            sceneId: scene.id,
            activeOption,
            np_prompt: currentNpPrompt,
            video_prompt: currentVideoPrompt,
            assetsCount: currentAssetsCount,
            instanceInitialized: !!reactFlowInstance
        };

        setNodes(nds => {
            if (nds.length === 0) return nds;
            let changed = false;
            const updated = nds.map(node => {
                if (node.id === 'image-prompt') {
                    const newNpPrompt = option.np_prompt || '';
                    const newCamera = option.camera || '';
                    const newLens = option.lens || '';
                    const newFocalLength = option.focal_length || '';
                    const newAperture = option.aperture || '';
                    const newImageModel = option.imageModel || 'gpt-image-2';
                    const newImageSize = option.imageSize || '16:9';
                    const newImageQuality = option.imageQuality || 'auto';
                    const newGenStatus = currentGenStatus;
                    const connected = getConnectedImagesForNode(node.id);

                    if (
                        node.data.np_prompt !== newNpPrompt ||
                        node.data.camera !== newCamera ||
                        node.data.lens !== newLens ||
                        node.data.focal_length !== newFocalLength ||
                        node.data.aperture !== newAperture ||
                        node.data.imageModel !== newImageModel ||
                        node.data.imageSize !== newImageSize ||
                        node.data.imageQuality !== newImageQuality ||
                        node.data.genStatus !== newGenStatus ||
                        node.data.assets !== assets ||
                        node.data.sceneImages !== sceneImages ||
                        JSON.stringify(node.data.connectedImages) !== JSON.stringify(connected)
                    ) {
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                np_prompt: newNpPrompt,
                                camera: newCamera,
                                lens: newLens,
                                focal_length: newFocalLength,
                                aperture: newAperture,
                                imageModel: newImageModel,
                                imageSize: newImageSize,
                                imageQuality: newImageQuality,
                                genStatus: newGenStatus,
                                assets,
                                sceneImages,
                                connectedImages: connected
                            }
                        };
                    }
                    return node;
                }
                if (node.id === 'image-output') {
                    if (
                        node.data.imageUrl !== option.imageUrl ||
                        node.data.imageAssetId !== option.imageAssetId ||
                        node.data.genStatus !== currentGenStatus
                    ) {
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                imageUrl: option.imageUrl,
                                imageAssetId: option.imageAssetId,
                                genStatus: currentGenStatus
                            }
                        };
                    }
                    return node;
                }
                if (node.id === 'video-prompt') {
                    const newVideoPrompt = option.video_prompt || '';
                    const newVideoModel = option.videoModel || 'doubao-seedance-2-0-260128';
                    const newRefImageMode = option.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto');
                    const newVideoStatus = currentVideoStatus;
                    const connected = getConnectedImagesForNode(node.id);

                    if (
                        node.data.video_prompt !== newVideoPrompt ||
                        node.data.videoModel !== newVideoModel ||
                        node.data.refImageMode !== newRefImageMode ||
                        node.data.videoStatus !== newVideoStatus ||
                        node.data.assets !== assets ||
                        node.data.sceneImages !== sceneImages ||
                        JSON.stringify(node.data.connectedImages) !== JSON.stringify(connected)
                    ) {
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                video_prompt: newVideoPrompt,
                                videoModel: newVideoModel,
                                refImageMode: newRefImageMode,
                                videoStatus: newVideoStatus,
                                assets,
                                sceneImages,
                                connectedImages: connected
                            }
                        };
                    }
                    return node;
                }
                if (node.id === 'video-output') {
                    const newVideoUrl = scene.isStartEndFrameMode ? scene.startEndVideoUrl : option.videoUrl;
                    const newVideoAssetId = scene.isStartEndFrameMode ? scene.startEndVideoAssetId : option.videoAssetId;
                    if (
                        node.data.videoUrl !== newVideoUrl ||
                        node.data.videoAssetId !== newVideoAssetId ||
                        node.data.videoStatus !== currentVideoStatus
                    ) {
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                videoUrl: newVideoUrl,
                                videoAssetId: newVideoAssetId,
                                videoStatus: currentVideoStatus
                            }
                        };
                    }
                    return node;
                }
                if (node.type === 'sceneRef' && node.data?.scene?.id) {
                    const matchedScene = allScenes.find(s => s.id === node.data.scene.id);
                    if (matchedScene && node.data.scene !== matchedScene) {
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                scene: matchedScene
                            }
                        };
                    }
                    return node;
                }
                if (node.type === 'firstLastFrame') {
                    return node;
                }
                return node;
            });
            return changed ? updated : nds;
        });

        lastGenStatusRef.current = currentGenStatus;
        lastVideoStatusRef.current = currentVideoStatus;
        isFirstSyncRef.current = false;
    }, [isOpen, activeOption, scene.prompt_options, scene.imageUrl, scene.imageAssetId, scene.videoUrl, scene.videoAssetId, scene.isStartEndFrameMode, scene.startEndVideoUrl, scene.startEndVideoAssetId, scene.audio_sfx, scene.audio_bgm, currentGenStatus, currentVideoStatus, assets, sceneImages, allScenes, edges, reactFlowInstance, getOptionData, getConnectedImagesForNode, onUploadImage, onDeleteImage, onUploadVideo, onDeleteVideo, onSceneUpdate, onGenerateImage, onGenerateVideo, syncPromptsToCanvasWrapper, handleExtractFirstLastFrame]);

    // 变动自动保存
    useEffect(() => {
        if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            handleSaveLayout();
        }
    }, [nodes, edges, handleSaveLayout]);

    const onNodeDragStop = () => {
        debouncedSaveLayout();
    };

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // 拖拽放置节点
    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();

        if (!reactFlowInstance) {
            console.warn("reactFlowInstance is not available yet in onDrop");
            return;
        }

        let type = event.dataTransfer.getData('application/reactflow');
        let assetId = event.dataTransfer.getData('assetId');
        let sceneIdRef = event.dataTransfer.getData('sceneId');
        let optionId = event.dataTransfer.getData('optionId');

        if (!type) {
            const plainText = event.dataTransfer.getData('text/plain');
            if (plainText) {
                try {
                    const parsed = JSON.parse(plainText);
                    if (parsed && typeof parsed === 'object') {
                        type = parsed.type;
                        assetId = parsed.assetId;
                        sceneIdRef = parsed.sceneId;
                        optionId = parsed.optionId;
                    } else {
                        type = plainText;
                    }
                } catch (e) {
                    type = plainText;
                }
            }
        }

        if (!type) return;

        let position = { x: event.clientX - 100, y: event.clientY - 100 };
        try {
            if (typeof reactFlowInstance.screenToFlowPosition === 'function') {
                position = reactFlowInstance.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                });
            } else if (typeof reactFlowInstance.project === 'function') {
                position = reactFlowInstance.project({
                    x: event.clientX,
                    y: event.clientY,
                });
            }
        } catch (err) {
            console.error("Error converting coordinate in onDrop:", err);
        }

        const dropTimestamp = Date.now();
        let newNode: any = {
            id: `node_${dropTimestamp}`,
            type,
            position,
            data: {}
        };

        if (type === 'asset' && assetId) {
            const assetObj = assets.find(a => a.id === assetId);
            if (!assetObj) return;
            newNode.id = `asset_${assetObj.id}_inst_${dropTimestamp}`;
            newNode.data = { asset: assetObj };
        } else if (type === 'sceneRef' && sceneIdRef) {
            const sceneObj = allScenes.find(s => s.id === sceneIdRef);
            if (!sceneObj) return;
            newNode.id = optionId ? `scene_${sceneObj.id}_${optionId}_inst_${dropTimestamp}` : `scene_${sceneObj.id}_inst_${dropTimestamp}`;
            newNode.data = { scene: sceneObj, optionId: optionId || undefined };
        } else {
            const baseId = type === 'imagePrompt' ? 'image-prompt' :
                type === 'imageOutput' ? 'image-output' :
                    type === 'videoPrompt' ? 'video-prompt' :
                        type === 'firstLastFrame' ? 'first-last-frame' : 'video-output';

            const isPrimaryExists = nodes.some(n => n.id === baseId);
            if (isPrimaryExists) {
                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: { message: "该类型节点已存在，每个方案的画布仅允许存在唯一的主节点！", type: 'warning' }
                }));
                return;
            }
            newNode.id = baseId;

            const option = getOptionData(activeOption);
            if (type === 'imagePrompt') {
                newNode.data = {
                    np_prompt: option.np_prompt,
                    imageModel: option.imageModel || 'gpt-image-2',
                    imageSize: option.imageSize || '16:9',
                    imageQuality: option.imageQuality || 'auto',
                    camera: option.camera || '',
                    lens: option.lens || '',
                    focal_length: option.focal_length || '',
                    aperture: option.aperture || '',
                    genStatus: currentGenStatus,
                    onUpdate: (f: string, v: any) => updateOptionField(f, v),
                    onGenerate: () => {
                        setNodes(nds => nds.map(n => {
                            if (n.id === baseId) {
                                return { ...n, data: { ...n.data, genStatus: ImageGenStatus.GENERATING } };
                            }
                            return n;
                        }));
                        onGenerateImage(scene, activeOption);
                    },
                    onBlur: () => {
                        const opt = getOptionData(activeOption);
                        syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                    },
                    assets,
                    sceneImages,
                    connectedImages: getConnectedImagesForNode(baseId),
                    onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage(baseId, sourceNodeId, name)
                };
            } else if (type === 'imageOutput') {
                newNode.data = {
                    imageUrl: option.imageUrl,
                    imageAssetId: option.imageAssetId,
                    genStatus: currentGenStatus,
                    onUpload: (file: File) => onUploadImage(file, activeOption),
                    onDelete: () => onDeleteImage(activeOption),
                    onDownload: () => window.open(option.imageUrl, '_blank')
                };
            } else if (type === 'videoPrompt') {
                newNode.data = {
                    video_prompt: option.video_prompt,
                    videoModel: option.videoModel || 'doubao-seedance-2-0-260128',
                    refImageMode: option.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto'),
                    videoStatus: currentVideoStatus,
                    onUpdate: (f: string, v: any) => {
                        if (f === 'refImageMode') {
                            onSceneUpdate(scene.id, { isStartEndFrameMode: v === 'start_end_frame' || v === 'first_frame' });
                        }
                        updateOptionField(f, v);
                    },
                    onGenerate: () => {
                        setNodes(nds => nds.map(n => {
                            if (n.id === baseId) {
                                return { ...n, data: { ...n.data, videoStatus: ImageGenStatus.GENERATING } };
                            }
                            return n;
                        }));
                        onGenerateVideo(scene, activeOption);
                    },
                    onBlur: () => {
                        const opt = getOptionData(activeOption);
                        syncPromptsToCanvasWrapper(opt.np_prompt || '', opt.video_prompt || '');
                    },
                    onDisconnectImage: (sourceNodeId: string, name?: string) => handleDisconnectImage(baseId, sourceNodeId, name),
                    connectedImages: getConnectedImagesForNode(baseId),
                    assets,
                    sceneImages
                };
            } else if (type === 'videoOutput') {
                newNode.data = {
                    videoUrl: option.videoUrl,
                    videoAssetId: option.videoAssetId,
                    videoStatus: currentVideoStatus,
                    onUpload: (file: File) => onUploadVideo(file, activeOption),
                    onDelete: () => onDeleteVideo(activeOption),
                    onDownload: () => window.open(option.videoUrl, '_blank')
                };
            } else if (type === 'firstLastFrame') {
                newNode.data = {
                    videoUrl: undefined,
                    videoAssetId: undefined,
                    startImageUrl: undefined,
                    startImageAssetId: undefined,
                    endImageUrl: undefined,
                    endImageAssetId: undefined,
                    onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(baseId, timeType)
                };
            }
        }

        if (['image-prompt', 'image-output', 'video-prompt', 'video-output', 'first-last-frame'].includes(newNode.id)) {
            const alreadyExists = nodes.some(n => n.id === newNode.id);
            if (alreadyExists) return;
        }

        takeHistorySnapshot();

        const nextNodes = nodes.concat(newNode);
        setNodes(nextNodes);
        latestNodesRef.current = nextNodes;
        pendingSaveRef.current = true;
    }, [reactFlowInstance, assets, sceneImages, allScenes, activeOption, scene, currentGenStatus, currentVideoStatus, nodes, takeHistorySnapshot, getOptionData, updateOptionField, getConnectedImagesForNode, handleDisconnectImage, handleExtractFirstLastFrame, onUploadImage, onDeleteImage, onUploadVideo, onDeleteVideo, onGenerateImage, onGenerateVideo, onSceneUpdate, setNodes, setEdges]);

    return {
        activeOption,
        setActiveOption,
        showSettingsModal,
        setShowSettingsModal,
        nodes,
        edges,
        setNodes,
        setEdges,
        onNodesChange,
        onEdgesChange,
        reactFlowInstance,
        setReactFlowInstance,
        pastCount,
        futureCount,
        undo,
        redo,
        copyNodes,
        cutNodes,
        pasteNodes,
        onNodeDragStart,
        onNodeDragStop,
        onPaneDoubleClick,
        handleResetLayout,
        onDragOver,
        onDrop,
        hoveredItem,
        setHoveredItem,
        currentGenStatus,
        currentVideoStatus,
        sceneImages,
        updateOptionField,
        handleDisconnectImage,
        getConnectedImagesForNode,
        getOptionData,
        takeHistorySnapshot,
        handleConnect,
        handleEdgesDelete,
        handleNodesDelete
    };
}
