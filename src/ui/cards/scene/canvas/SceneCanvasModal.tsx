import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    ReactFlow, 
    Background, 
    Controls, 
    MiniMap,
    useNodesState, 
    useEdgesState, 
    addEdge, 
    Panel,
    Connection,
    Edge,
    Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, ChevronLeft, Layers, Plus, Trash2, Aperture, Film, Image as ImageIcon, User, MapPin, Box, Video, Music, Undo, Redo, Copy, Scissors, Clipboard } from 'lucide-react';
import { Scene, Asset, GlobalStyle, ImageGenStatus } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { loadAssetBase64, saveAsset, downloadAndSaveVideo, loadAssetUrl } from '@/services/storage';
import { generateSceneImage, generateVideo, pollVideoUntilDone, generateSpeech, pcmToWav } from '@/services/ai';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag, ASSET_TAG_REGEX, ParsedTag } from '@/shared/asset-tags';

const API_BASE = (import.meta as any).env?.DEV ? 'http://127.0.0.1:3002/api' : '/api';

// Import Custom Nodes
import { AssetNode } from './nodes/AssetNode';
import { SceneRefNode } from './nodes/SceneRefNode';
import { ImagePromptNode } from './nodes/ImagePromptNode';
import { ImageOutputNode } from './nodes/ImageOutputNode';
import { VideoPromptNode } from './nodes/VideoPromptNode';
import { VideoOutputNode } from './nodes/VideoOutputNode';
import { FirstLastFrameNode } from './nodes/FirstLastFrameNode';
import { CustomNoteNode } from './nodes/CustomNoteNode';

// Match custom node types
const extractVideoFrame = (videoUrl: string, timeType: 'start' | 'end'): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        
        // Style and append the video to the DOM to force browser decoding pipelines to initialize
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

        // Attach listeners before assigning src/load to prevent race conditions on cached or blob URLs
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

        video.onerror = (e) => {
            cleanup();
            reject(new Error('Failed to load video for frame extraction'));
        };

        // Only set crossOrigin if the video is not a local blob URL
        if (!videoUrl.startsWith('blob:')) {
            video.crossOrigin = 'anonymous';
        }
        
        video.muted = true;
        video.playsInline = true;
        
        // Trigger media load sequence
        let resolvedSrc = videoUrl;
        if (videoUrl.startsWith('http')) {
            resolvedSrc = `${API_BASE}/media/download-proxy?url=${encodeURIComponent(videoUrl)}`;
        }
        video.src = resolvedSrc;
        video.load();
    });
};

const getMiniMapNodeColor = (node: Node) => {
    switch (node.type) {
        case 'imagePrompt':
            return '#06b6d4'; // 青色 (Cyan)
        case 'imageOutput':
            return '#ec4899'; // 粉色 (Pink)
        case 'videoPrompt':
        case 'videoOutput':
            return '#a855f7'; // 紫色 (Purple)
        case 'firstLastFrame':
            return '#eab308'; // 黄色 (Yellow)
        case 'asset':
            return '#06b6d4'; // 青色 (资产)
        case 'sceneRef':
            return '#10b981'; // 绿色 (分镜引用)
        case 'customNote':
            return '#f59e0b'; // 琥珀黄 (Amber)
        default:
            return '#4b5563'; // 深灰 (默认)
    }
};

const nodeTypes = {
    asset: AssetNode,
    sceneRef: SceneRefNode,
    imagePrompt: ImagePromptNode,
    imageOutput: ImageOutputNode,
    videoPrompt: VideoPromptNode,
    videoOutput: VideoOutputNode,
    firstLastFrame: FirstLastFrameNode,
    customNote: CustomNoteNode
};

interface SceneCanvasModalProps {
    isOpen: boolean;
    onClose: () => void;
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
    onAddAsset?: (asset: Asset) => void;
    initialOptionId?: string;
}

const CAMERAS = ['None', 'Arri Alexa Mini LF', 'Red V-Raptor', 'Sony Venice 2', 'Panavision DXL2', 'BMD Ursa Mini Pro', 'Canon C500 Mk II'];
const LENSES = ['None', 'Arri Signature Prime', 'Zeiss Supreme Prime', 'Cooke SF 1.8x', 'Panavision Primo', 'Leica Summilux-C', 'Angenieux Optimo'];
const FOCAL_LENGTHS = ['None', '18', '24', '35', '50', '75', '85', '100', '125', '135', '150'];
const APERTURES = ['None', 'f/1.2', 'f/1.4', 'f/1.8', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0', 'f/11', 'f/16'];

const renderHighlightedPrompt = (text: string) => {
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

export const SceneCanvasModal: React.FC<SceneCanvasModalProps> = ({
    isOpen,
    onClose,
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
    onAddAsset,
    initialOptionId
}) => {
    // Current Active Option: A / B / C
    const [activeOption, setActiveOption] = useState<'A' | 'B' | 'C'>((initialOptionId as any) || 'A');

    const currentGenStatus = genStatusMap[activeOption] || ImageGenStatus.IDLE;
    const currentVideoStatus = videoStatusMap[activeOption] || ImageGenStatus.IDLE;
    const [ttsLoading, setTtsLoading] = useState(false);

    // React Flow States
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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

    // Track statuses for main node auto-spawn detection
    const isFirstSyncRef = useRef(true);
    const lastGenStatusRef = useRef(currentGenStatus);
    const lastVideoStatusRef = useRef(currentVideoStatus);

    // Initial load/caching of option parameters
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

    useEffect(() => {
        latestNodesRef.current = nodes;
    }, [nodes]);

    useEffect(() => {
        latestEdgesRef.current = edges;
    }, [edges]);



    // Save Canvas Layout coordinates and nodes to parent component Scene
    const handleSaveLayout = useCallback(() => {
        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        // Strip out dynamic functions from serializable nodes
        const serializableNodes = currentNodes.map(n => {
            const stripped = { ...n };
            const strippedData = { ...n.data };
            // Dynamically strip any function property
            Object.keys(strippedData).forEach(key => {
                if (typeof strippedData[key] === 'function') {
                    delete strippedData[key];
                }
            });
            // Also explicitly delete typical non-serializable fields
            delete strippedData.connectedImages;
            delete strippedData.assets;
            delete strippedData.sceneImages; // Keep serializable nodes clean
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
    }, [activeOption, scene.id]);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // History Stack for Undo/Redo
    const historyRef = useRef<{
        past: Array<{ nodes: any[]; edges: any[] }>;
        future: Array<{ nodes: any[]; edges: any[] }>;
    }>({ past: [], future: [] });

    const [pastCount, setPastCount] = useState(0);
    const [futureCount, setFutureCount] = useState(0);

    const takeHistorySnapshot = useCallback(() => {
        const snapshotNodes = latestNodesRef.current.map(n => ({
            ...n,
            position: { ...n.position },
            data: { ...n.data }
        }));
        const snapshotEdges = latestEdgesRef.current.map(e => ({ ...e }));

        historyRef.current.past.push({ nodes: snapshotNodes, edges: snapshotEdges });
        if (historyRef.current.past.length > 50) {
            historyRef.current.past.shift();
        }
        historyRef.current.future = [];
        
        setPastCount(historyRef.current.past.length);
        setFutureCount(0);
    }, []);

    const syncEdgesToPromptText = useCallback((restoredNodes: any[], restoredEdges: any[]) => {
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
    }, [activeOption, scene.id, onSceneUpdate, getOptionData]);

    const undo = useCallback(() => {
        const past = historyRef.current.past;
        if (past.length === 0) return;

        const currentSnapshot = {
            nodes: latestNodesRef.current.map(n => ({
                ...n,
                position: { ...n.position },
                data: { ...n.data }
            })),
            edges: latestEdgesRef.current.map(e => ({ ...e }))
        };

        const previousSnapshot = past.pop()!;
        historyRef.current.future.push(currentSnapshot);

        setNodes(previousSnapshot.nodes);
        setEdges(previousSnapshot.edges);
        
        latestNodesRef.current = previousSnapshot.nodes;
        latestEdgesRef.current = previousSnapshot.edges;

        setPastCount(past.length);
        setFutureCount(historyRef.current.future.length);
        
        syncEdgesToPromptText(previousSnapshot.nodes, previousSnapshot.edges);

        pendingSaveRef.current = true;
        debouncedSaveLayout();
    }, [setNodes, setEdges, debouncedSaveLayout, syncEdgesToPromptText]);

    const redo = useCallback(() => {
        const future = historyRef.current.future;
        if (future.length === 0) return;

        const currentSnapshot = {
            nodes: latestNodesRef.current.map(n => ({
                ...n,
                position: { ...n.position },
                data: { ...n.data }
            })),
            edges: latestEdgesRef.current.map(e => ({ ...e }))
        };

        const nextSnapshot = future.pop()!;
        historyRef.current.past.push(currentSnapshot);

        setNodes(nextSnapshot.nodes);
        setEdges(nextSnapshot.edges);

        latestNodesRef.current = nextSnapshot.nodes;
        latestEdgesRef.current = nextSnapshot.edges;

        setPastCount(historyRef.current.past.length);
        setFutureCount(future.length);

        syncEdgesToPromptText(nextSnapshot.nodes, nextSnapshot.edges);

        pendingSaveRef.current = true;
        debouncedSaveLayout();
    }, [setNodes, setEdges, debouncedSaveLayout, syncEdgesToPromptText]);

    // Clipboard operations (Copy, Cut, Paste)
    const copyNodes = useCallback(() => {
        const selectedNodes = latestNodesRef.current.filter(n => n.selected);
        if (selectedNodes.length === 0) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "请先选中需要复制的节点！", type: 'warning' }
            }));
            return;
        }

        const functionalTypes = ['imagePrompt', 'imageOutput', 'videoPrompt', 'videoOutput', 'firstLastFrame', 'audio'];
        const hasFunctional = selectedNodes.some(n => functionalTypes.includes(n.type || ''));
        const copyableNodes = selectedNodes.filter(n => !functionalTypes.includes(n.type || ''));
        
        if (hasFunctional) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "主配置/主输出功能节点不支持复制，已自动忽略！", type: 'warning' }
            }));
        }

        if (copyableNodes.length === 0) return;

        const copyableNodeIds = copyableNodes.map(n => n.id);
        const copyableEdges = latestEdgesRef.current.filter(
            e => copyableNodeIds.includes(e.source) && copyableNodeIds.includes(e.target)
        );

        const clipboardData = {
            nodes: copyableNodes,
            edges: copyableEdges
        };

        try {
            localStorage.setItem('nanobanana_storyboard_clipboard', JSON.stringify(clipboardData));
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: `已成功复制 ${copyableNodes.length} 个节点！`, type: 'success' }
            }));
        } catch (err) {
            console.error("Failed to copy nodes to localStorage:", err);
        }
    }, []);

    const cutNodes = useCallback(() => {
        const selectedNodes = latestNodesRef.current.filter(n => n.selected);
        if (selectedNodes.length === 0) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "请先选中需要剪切的节点！", type: 'warning' }
            }));
            return;
        }

        const functionalTypes = ['imagePrompt', 'imageOutput', 'videoPrompt', 'videoOutput', 'firstLastFrame', 'audio'];
        const copyableNodes = selectedNodes.filter(n => !functionalTypes.includes(n.type || ''));
        
        const hasFunctional = selectedNodes.some(n => functionalTypes.includes(n.type || ''));
        if (hasFunctional) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "主配置/主输出功能节点不支持剪切！", type: 'warning' }
            }));
        }

        if (copyableNodes.length === 0) return;

        takeHistorySnapshot();

        const copyableNodeIds = copyableNodes.map(n => n.id);
        const copyableEdges = latestEdgesRef.current.filter(
            e => copyableNodeIds.includes(e.source) && copyableNodeIds.includes(e.target)
        );
        const clipboardData = { nodes: copyableNodes, edges: copyableEdges };
        localStorage.setItem('nanobanana_storyboard_clipboard', JSON.stringify(clipboardData));

        setNodes(nds => nds.filter(n => !copyableNodeIds.includes(n.id)));
        setEdges(eds => eds.filter(e => !copyableNodeIds.includes(e.source) && !copyableNodeIds.includes(e.target)));

        window.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: `已剪切 ${copyableNodes.length} 个节点并放入剪贴板！`, type: 'success' }
        }));

        pendingSaveRef.current = true;
        debouncedSaveLayout();
    }, [takeHistorySnapshot, setNodes, setEdges, debouncedSaveLayout]);

    const pasteNodes = useCallback(() => {
        const rawData = localStorage.getItem('nanobanana_storyboard_clipboard');
        if (!rawData) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "剪贴板为空！", type: 'warning' }
            }));
            return;
        }

        try {
            const clipboardData = JSON.parse(rawData);
            const { nodes: copyNodes, edges: copyEdges } = clipboardData as { nodes: any[]; edges: any[] };

            if (!copyNodes || copyNodes.length === 0) return;

            takeHistorySnapshot();

            const timestamp = Date.now();
            const idMap: Record<string, string> = {};

            const offsetX = 50;
            const offsetY = 50;

            const newNodes = copyNodes.map((n, idx) => {
                const newId = `pasted-${n.type || 'node'}-${timestamp}-${idx}`;
                idMap[n.id] = newId;

                return {
                    ...n,
                    id: newId,
                    selected: true,
                    position: {
                        x: (n.position?.x || 0) + offsetX,
                        y: (n.position?.y || 0) + offsetY
                    },
                    data: { ...n.data }
                };
            });

            const newEdges = (copyEdges || []).map((e, idx) => {
                const newSource = idMap[e.source];
                const newTarget = idMap[e.target];
                return {
                    ...e,
                    id: `pasted-edge-${timestamp}-${idx}`,
                    source: newSource,
                    target: newTarget
                };
            }).filter(e => e.source && e.target);

            setNodes(nds => {
                const deselected = nds.map(n => ({ ...n, selected: false }));
                const final = [...deselected, ...newNodes];
                latestNodesRef.current = final;
                return final;
            });

            if (newEdges.length > 0) {
                setEdges(eds => {
                    const final = [...eds, ...newEdges];
                    latestEdgesRef.current = final;
                    return final;
                });
            }

            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: `已成功粘贴 ${newNodes.length} 个节点！`, type: 'success' }
            }));

            pendingSaveRef.current = true;
            debouncedSaveLayout();
        } catch (err) {
            console.error("Failed to paste nodes from localStorage:", err);
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "解析剪贴板数据失败！", type: 'warning' }
            }));
        }
    }, [takeHistorySnapshot, setNodes, setEdges, debouncedSaveLayout]);

    // Keyboard shortcut listeners
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const isModifier = e.ctrlKey || e.metaKey;
            if (!isModifier) return;

            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName?.toLowerCase();
            const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select' || (active ? (active as any).isContentEditable === true : false);
            if (isEditing) return;

            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                e.preventDefault();
                redo();
            } else if (key === 'c') {
                e.preventDefault();
                copyNodes();
            } else if (key === 'x') {
                e.preventDefault();
                cutNodes();
            } else if (key === 'v') {
                e.preventDefault();
                pasteNodes();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, [undo, redo, copyNodes, cutNodes, pasteNodes]);

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

    // Handle Narration TTS Generation inside canvas
    const handleNarrationTTS = useCallback(async () => {
        if (!scene.narration) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: "当前分镜没有旁白文本，无法合成旁白 TTS！", type: 'warning' }
            }));
            return;
        }
        setTtsLoading(true);
        setNodes(nds => nds.map(n => {
            if (n.id === 'audio') {
                return { ...n, data: { ...n.data, ttsLoading: true } };
            }
            return n;
        }));

        try {
            const voiceId = styleState.narrationVoice || "Kore";
            const base64Data = await generateSpeech(scene.narration, voiceId);
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
            const reader = new FileReader();
            reader.readAsDataURL(wavBlob);
            reader.onloadend = () => {
                const url = reader.result as string;
                onSceneUpdate(scene.id, { narrationAudioUrl: url });
                setNodes(nds => nds.map(n => {
                    if (n.id === 'audio') {
                        return { ...n, data: { ...n.data, narrationAudioUrl: url, ttsLoading: false } };
                    }
                    return n;
                }));
                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: { message: "旁白 TTS 合成成功！", type: 'success' }
                }));
            };
        } catch (e: any) {
            console.error("Narration TTS Failed", e);
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: `旁白 TTS 合成失败: ${e.message || e}`, type: 'warning' }
            }));
            setNodes(nds => nds.map(n => {
                if (n.id === 'audio') {
                    return { ...n, data: { ...n.data, ttsLoading: false } };
                }
                return n;
            }));
        } finally {
            setTtsLoading(false);
        }
    }, [scene.narration, scene.id, styleState.narrationVoice, onSceneUpdate, setNodes]);



    // Video Frame Extraction client-side


    // Extract start or end frame individually
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

            // Resolve the actual url using loadAssetUrl if database asset exists
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

    // Draft Image Generation




    // Resolve all scenes into sceneImages candidates list for MentionTextarea tag matching
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



    // Check connection & Tag sync
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

        // Perform Tag Addition Sync
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
        
        // Mark pending save so useEffect can trigger handleSaveLayout
        pendingSaveRef.current = true;
    }, [nodes, activeOption, scene, takeHistorySnapshot]);

    // Handles user deleting Edges
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

            // Clean matching tag from prompt
            if (edge.target === 'image-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_${assetName}#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(?:首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_分镜${sceneObj.id}(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '').replace(/\s+/g, ' ').trim();
                updateOptionField('np_prompt', newPrompt);
            } else if (edge.target === 'video-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_${assetName}#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(?:首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_分镜${sceneObj.id}(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '').replace(/\s+/g, ' ').trim();
                updateOptionField('video_prompt', newPrompt);
            }
        });

        // Mark pending save so useEffect can trigger handleSaveLayout
        pendingSaveRef.current = true;
    }, [nodes, activeOption, scene, takeHistorySnapshot]);

    // Handles user deleting Nodes
    const handleNodesDelete = useCallback((nodesToDelete: Node[]) => {
        takeHistorySnapshot();
        console.log("Nodes deleted from canvas:", nodesToDelete.map(n => n.id));
        
        // Find outgoing edges from the deleted nodes
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

            // Clean matching tag from prompt
            if (edge.target === 'image-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_${assetName}#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(?:首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_分镜${sceneObj.id}(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '').replace(/\s+/g, ' ').trim();
                updateOptionField('np_prompt', newPrompt);
            } else if (edge.target === 'video-prompt') {
                const currentPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
                let cleanRegex: RegExp;
                if (isAsset) {
                    cleanRegex = new RegExp(`\\[@图像_${assetName}#${assetId}\\]`, 'g');
                } else if (isFirstLastFrame) {
                    const startId = sourceNode.data.startImageAssetId || `first_frame_${sourceNode.id}`;
                    const endId = sourceNode.data.endImageAssetId || `last_frame_${sourceNode.id}`;
                    cleanRegex = new RegExp(`\\[@图像_(?:首帧|尾帧)#(?:${startId}|${endId}|first_frame_${sourceNode.id}|last_frame_${sourceNode.id})\\]`, 'g');
                } else {
                    cleanRegex = new RegExp(`\\[@图像_分镜${sceneObj.id}(?:-[A-C])?#scene_img_${sceneObj.id}(?:_[A-C])?\\]`, 'g');
                }
                const newPrompt = currentPrompt.replace(cleanRegex, '').replace(/\s+/g, ' ').trim();
                updateOptionField('video_prompt', newPrompt);
            }
        });

        // Mark pending save so useEffect can trigger handleSaveLayout
        pendingSaveRef.current = true;
    }, [nodes, edges, activeOption, scene, takeHistorySnapshot]);

    // 统一解析提示词解析出来的 Tag 列表，转为具体的主键 ID 数组
    const getReferencedIdsFromTags = useCallback((tags: any[]) => {
        const ids: string[] = [];
        tags.forEach(tag => {
            if (isStoryboardTag(tag.name)) {
                // 解析分镜引用 ID
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
                // 解析资产 ID
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
    }, [allScenes, assets]);


    // 文本同步解析：一次性将 Image 和 Video 两个提示词同步到画布连线与节点，彻底避免同 Tick 竞态覆盖
    const syncPromptsToCanvas = useCallback((npPrompt: string, videoPrompt: string) => {
        if (!reactFlowInstance) return;
        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        // 1. 解析所有生图/生视频配置节点中引用的标签列表
        const nodeToTagsMap = new Map<string, { tags: ParsedTag[], isVideo: boolean, targetHandle: string }>();
        
        currentNodes.forEach((n: any) => {
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
        currentNodes.forEach((n: any) => { if (n && n.id) uniqueNodesMap.set(n.id, n); });
        const nextNodes = Array.from(uniqueNodesMap.values());

        // 2. 统一清理过时连线
        const cleanedEdges = currentEdges.filter((e: any) => {
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
                let actualSourceId = existingNode ? existingNode.id : sourceNodeId;

                if (!nodeExists) {
                    const refNodes = nextNodes.filter((n: any) => n.type === 'sceneRef' || n.type === 'asset' || n.type === 'firstLastFrame');
                    const newRefIdx = refNodes.length;
                    let nodeY = info.isVideo ? (950 + newRefIdx * 160) : (200 + newRefIdx * 160);

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
                                onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(sourceNodeId, timeType)
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

        const edgeLengthDiff = currentEdges.length !== cleanedEdges.length || 
            JSON.stringify(currentEdges.map(e => e.id).sort()) !== JSON.stringify(cleanedEdges.map(e => e.id).sort());

        if (changedNodes) {
            setNodes(finalNodes);
        }
        if (changedEdges || edgeLengthDiff) {
            setEdges(cleanedEdges);
        }

        if (changedNodes || changedEdges || edgeLengthDiff) {
            pendingSaveRef.current = true;
            setTimeout(() => {
                handleSaveLayout();
            }, 100);
        }
    }, [reactFlowInstance, allScenes, assets, setNodes, setEdges, handleSaveLayout]);

    // Local trigger function to update specific fields in option
    const updateOptionField = (field: string, value: any) => {
        // Update local React Flow nodes state synchronously to prevent input freezing and cursor jumps
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
                // Instantiate default options if missing
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

            // Parse tags to synchronize assetIds and videoAssetIds in DB
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

            // Synchronize directly into top-level Scene parameters if option A
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

        // Clean and update edges instantly outside onSceneUpdate to avoid setState during rendering warnings
        if (field === 'np_prompt') {
            const currentVideoPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.video_prompt || '';
            syncPromptsToCanvas(value || '', currentVideoPrompt);
        } else if (field === 'video_prompt') {
            const currentNpPrompt = scene.prompt_options?.find(o => o.option_id === activeOption)?.np_prompt || '';
            syncPromptsToCanvas(currentNpPrompt, value || '');
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
        setEdges((eds) => eds.filter(e => {
            const matchesSourceAndTarget = e.source === sourceNodeId && e.target === videoNodeId;
            if (!matchesSourceAndTarget) return true;
            if (name === '首帧') return e.sourceHandle !== 'source-start';
            if (name === '尾帧') return e.sourceHandle !== 'source-end';
            return false;
        }));
        pendingSaveRef.current = true;
    }, [setEdges]);

    // Automatically sync connected image IDs to scene's startEndAssetIds or videoAssetIds
    useEffect(() => {
        if (!isOpen) return;
        
        // Find all incoming edges to the main video-prompt node
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
        
        // De-duplicate
        const uniqueIds = Array.from(new Set(imageAssetIds));

        // Auto-detect firstLastFrame node from canvas nodes to extract custom start/end frame references
        const firstLastNode = nodes.find(n => n.type === 'firstLastFrame');
        const customStartId = firstLastNode?.data?.startImageAssetId;
        const customEndId = firstLastNode?.data?.endImageAssetId;
        
        if (scene.isStartEndFrameMode) {
            // For Start & End mode:
            // index 0: start frame (always current scene image, i.e. scene_img_S02_A, or custom start frame if extracted)
            // index 1: end frame (the custom end frame, or first connected asset/sceneRef)
            const currentSceneImgId = `scene_img_${scene.id}_${activeOption || 'A'}`;
            
            // Find the first connected image ID that is NOT the current scene's image to serve as end frame
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
            // For standard video reference mode:
            // 🚀 Use synchronously-updated local video prompt state to prevent race conditions
            const videoPromptNode = nodes.find(n => n.id === 'video-prompt');
            const localVideoPrompt = videoPromptNode?.data?.video_prompt || '';
            const localTags = extractAssetTags(localVideoPrompt);
            const localVideoAssetIds = localTags.map(t => t.id).filter(Boolean) as string[];

            // Filter out customStartId and customEndId since they are internal and not parsed from video_prompt text tags
            const localVideoAssetIdsFiltered = localVideoAssetIds.filter(id => id !== customStartId && id !== customEndId);
            const uniqueIdsFiltered = uniqueIds.filter(id => id !== customStartId && id !== customEndId);

            // Check if there are connections on the canvas that have already been deleted from the local prompt
            const deletedIdsInText = uniqueIdsFiltered.filter(id => !localVideoAssetIdsFiltered.includes(id));
            if (deletedIdsInText.length > 0) {
                // Instantly sever these stale edges on the canvas
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
                                return false; // Sever link
                            }
                        }
                    }
                    return true;
                }));
                return;
            }

            // Check if there are new asset ids in the local prompt that haven't been wired as edges yet
            const addedIdsInText = localVideoAssetIdsFiltered.filter(id => !uniqueIdsFiltered.includes(id));
            if (addedIdsInText.length > 0) {
                // Let the edge-sync logic in syncTextToEdges catch up. Do not overwrite database state.
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

    // Automatically sync connected image IDs to scene's assetIds for image-prompt node
    useEffect(() => {
        if (!isOpen) return;

        // Find all incoming edges to the main image-prompt node
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

        // De-duplicate
        const uniqueIds = Array.from(new Set(imageAssetIds));

        // 🚀 Use local synchronously-updated prompt state to prevent race conditions
        const imagePromptNode = nodes.find(n => n.id === 'image-prompt');
        const localNpPrompt = imagePromptNode?.data?.np_prompt || '';
        const localTags = extractAssetTags(localNpPrompt);
        const localAssetIds = localTags.map(t => t.id).filter(Boolean) as string[];

        // Check if there are connections on the canvas that have already been deleted from the local prompt
        const deletedIdsInText = uniqueIds.filter(id => !localAssetIds.includes(id));
        if (deletedIdsInText.length > 0) {
            // Instantly sever these stale edges on the canvas
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
                            return false; // Sever link
                        }
                    }
                }
                return true;
            }));
            return;
        }

        // Check if there are new asset ids in the local prompt that haven't been wired as edges yet
        const addedIdsInText = localAssetIds.filter(id => !uniqueIds.includes(id));
        if (addedIdsInText.length > 0) {
            // Let the edge-sync logic in syncTextToEdges catch up. Do not overwrite database state.
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

    // Automatically sync video source URL/AssetID into firstLastFrame node data
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

    // Load nodes and edges layout from database or auto-generate defaults
    const loadLayout = useCallback(() => {
        const savedLayout = scene.canvas?.[activeOption];
        
        // Clean up edges in-place to match prompt text tags
        const option = getOptionData(activeOption);
        
        const imageTags = extractAssetTags(option.np_prompt || '');
        const imageReferencedIds = getReferencedIdsFromTags(imageTags);
        
        const videoTags = extractAssetTags(option.video_prompt || '');
        const videoReferencedIds = getReferencedIdsFromTags(videoTags);

        if (savedLayout && savedLayout.nodes && savedLayout.nodes.length > 0) {
            let needsMigration = false;
            const videoPromptNode = savedLayout.nodes.find((n: any) => n.id === 'video-prompt');
            if (videoPromptNode && videoPromptNode.position.y < 800) {
                needsMigration = true;
                pendingSaveRef.current = true;
            }

            let imageRefIdx = 0;
            let videoRefIdx = 0;

            // Deduplicate saved nodes by ID to prevent duplicate keys on load
            const uniqueNodesMap = new Map<string, any>();
            savedLayout.nodes.forEach((n: any) => {
                if (n && n.id) uniqueNodesMap.set(n.id, n);
            });
            const uniqueNodes = Array.from(uniqueNodesMap.values());

            const allReferencedAssetIds = Array.from(new Set([
                ...imageReferencedIds,
                ...videoReferencedIds
            ]));

            // Filter out saved nodes that are no longer referenced in prompt tags or don't exist
            const filteredSavedNodes = uniqueNodes.filter((node: any) => {
                if (node.id === 'audio') {
                    needsMigration = true;
                    return false;
                }
                // Core config nodes are always kept
                if (['image-prompt', 'image-output', 'video-prompt', 'video-output'].includes(node.id)) {
                    return true;
                }

                // Asset node: check existence in project assets library
                if (node.type === 'asset') {
                    const assetId = node.data?.asset?.id;
                    return assets.some(a => a.id === assetId);
                }
                // SceneRef node: check existence in project scenes list
                if (node.type === 'sceneRef') {
                    const sceneId = node.data?.scene?.id;
                    return allScenes.some(s => s.id === sceneId);
                }

                // FirstLastFrame node: always preserve it if it was added to the canvas
                if (node.type === 'firstLastFrame') {
                    return true;
                }
                return true;
            });

            // Apply dynamic callback bindings to parsed nodes
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
                            syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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
                            syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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
                    // Trace connected upstream video source to find videoUrl dynamically
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
            // Deduplicate saved edges by ID to prevent duplicate keys on load
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

            // Audio edge injection removed

            // Auto-heal missing primary connection edges
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

            // Auto-detect and spawn missing nodes & edges from prompt text tags when using savedLayout

            let newImageRefIdx = boundNodes.filter((n: any) => n.type === 'sceneRef' || n.type === 'asset').length;

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
                    // Match firstLastFrame node
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

                // 1. If node doesn't exist, spawn it
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
                let actualSourceId = existingNode ? existingNode.id : sourceNodeId;

                if (!nodeExists) {
                    let nodeY = 200;
                    if (imageReferencedIds.includes(id)) {
                        nodeY = 200 + (newImageRefIdx++) * 160;
                    } else if (videoReferencedIds.includes(id)) {
                        nodeY = 950 + (newImageRefIdx++) * 160;
                    } else {
                        nodeY = 200 + (newImageRefIdx++) * 160;
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

                // 2. If edge doesn't exist, spawn it
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
            // Auto-Generate default layout
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
                            syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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
                            syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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

            // Auto spawn connected Asset and SceneRef nodes from prompt text matches
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
    }, [scene, activeOption, assets, sceneImages, currentGenStatus, currentVideoStatus]);

    // Sync activeOption state with initialOptionId when modal opens or option ID changes
    useEffect(() => {
        if (isOpen && initialOptionId) {
            setActiveOption(initialOptionId as any);
        }
    }, [isOpen, initialOptionId]);

    // Trigger loading on option switch or scene open (NOT on every scene data change)
    useEffect(() => {
        if (isOpen) {
            // First reset the status flag to prevent cross-option pollution
            pendingSaveRef.current = false;
            isFirstSyncRef.current = true;
            lastGenStatusRef.current = genStatusMap[activeOption] || ImageGenStatus.IDLE;
            lastVideoStatusRef.current = videoStatusMap[activeOption] || ImageGenStatus.IDLE;

            // Then load layout (which may set pendingSaveRef.current = true for migrations or auto-spawns)
            loadLayout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, activeOption, scene.id]);



    // Sync external scene updates (like generated images/videos, status changes) into React Flow nodes
    useEffect(() => {
        if (!isOpen) return;
        const option = getOptionData(activeOption);

        // Auto-spawn Output nodes and connecting edges if generation completes
        const currentNodes = latestNodesRef.current;
        const currentEdges = latestEdgesRef.current;

        if (currentNodes.length > 0) {
            // 1. Main Image Output Auto-spawn
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

            // 2. Main Video Output Auto-spawn
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

        // Check if prompt text has changed or assets list count has changed compared to last synchronization
        const currentNpPrompt = option.np_prompt || '';
        const currentVideoPrompt = option.video_prompt || '';
        const currentAssetsCount = assets.length;

        // Detect if we just switched scene or option
        const isSwitch = lastSyncRef.current.sceneId !== scene.id || lastSyncRef.current.activeOption !== activeOption;

        // 🚀 Detect if reactFlowInstance transitioned from null to ready
        const instanceReady = reactFlowInstance && !lastSyncRef.current.instanceInitialized;

        if (!isSwitch) {
            const npPromptChanged = lastSyncRef.current.np_prompt !== currentNpPrompt || lastSyncRef.current.assetsCount !== currentAssetsCount || instanceReady;
            const videoPromptChanged = lastSyncRef.current.video_prompt !== currentVideoPrompt || lastSyncRef.current.assetsCount !== currentAssetsCount || instanceReady;

            if (npPromptChanged || videoPromptChanged) {
                syncPromptsToCanvas(currentNpPrompt, currentVideoPrompt);
            }
        }

        // Cache the synchronized values
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
            return nds.map(node => {
                if (node.id === 'image-prompt') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            np_prompt: option.np_prompt || '',
                            camera: option.camera || '',
                            lens: option.lens || '',
                            focal_length: option.focal_length || '',
                            aperture: option.aperture || '',
                            imageModel: option.imageModel || 'gpt-image-2',
                            imageSize: option.imageSize || '16:9',
                            imageQuality: option.imageQuality || 'auto',
                            genStatus: currentGenStatus,
                            assets,
                            sceneImages,
                            connectedImages: getConnectedImagesForNode(node.id)
                        }
                    };
                }
                if (node.id === 'image-output') {
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
                if (node.id === 'video-prompt') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            video_prompt: option.video_prompt || '',
                            videoModel: option.videoModel || 'doubao-seedance-2-0-260128',
                            refImageMode: option.refImageMode || (scene.isStartEndFrameMode ? 'start_end_frame' : 'auto'),
                            videoStatus: currentVideoStatus,
                            assets,
                            sceneImages,
                            connectedImages: getConnectedImagesForNode(node.id)
                        }
                    };
                }

                if (node.id === 'video-prompt') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            audio_sfx: scene.audio_sfx || '',
                            audio_bgm: scene.audio_bgm || '',
                            videoUrl: scene.isStartEndFrameMode ? scene.startEndVideoUrl : option.videoUrl,
                            videoAssetId: scene.isStartEndFrameMode ? scene.startEndVideoAssetId : option.videoAssetId,
                            videoStatus: currentVideoStatus
                        }
                    };
                }
                if (node.id === 'video-output') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            videoUrl: scene.isStartEndFrameMode ? scene.startEndVideoUrl : option.videoUrl,
                            videoAssetId: scene.isStartEndFrameMode ? scene.startEndVideoAssetId : option.videoAssetId,
                            videoStatus: currentVideoStatus
                        }
                    };
                }
                if (node.type === 'sceneRef' && node.data?.scene?.id) {
                    const matchedScene = allScenes.find(s => s.id === node.data.scene.id);
                    if (matchedScene) {
                        return {
                            ...node,
                            data: {
                               ...node.data,
                                scene: matchedScene
                            }
                        };
                    }
                }
                if (node.type === 'firstLastFrame') {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            onExtract: (timeType: 'start' | 'end') => handleExtractFirstLastFrame(node.id, timeType)
                        }
                    };
                }
                return node;
            });
        });

        // Update tracking status and firstSync flag
        lastGenStatusRef.current = currentGenStatus;
        lastVideoStatusRef.current = currentVideoStatus;
        isFirstSyncRef.current = false;
    }, [
        isOpen,
        activeOption,
        scene.prompt_options,
        scene.imageUrl,
        scene.imageAssetId,
        scene.videoUrl,
        scene.videoAssetId,
        scene.isStartEndFrameMode,
        scene.startEndVideoUrl,
        scene.startEndVideoAssetId,
        scene.narration,
        scene.narrationAudioUrl,
        scene.audio_sfx,
        scene.audio_bgm,
        styleState.narrationVoice,
        currentGenStatus,
        currentVideoStatus,
        assets,
        sceneImages,
        allScenes,
        edges,
        reactFlowInstance
    ]);



    // Auto-save after pending changes (ensures nodes/edges state is up-to-date)
    useEffect(() => {
        if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            handleSaveLayout();
        }
    }, [nodes, edges, handleSaveLayout]);

    // Save layout coordinates when nodes move
    const onNodeDragStop = () => {
        debouncedSaveLayout();
    };

    // HTML5 Drag and Drop Handlers
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        console.log("Canvas onDrop event triggered");

        if (!reactFlowInstance) {
            console.warn("reactFlowInstance is not available yet in onDrop");
            return;
        }

        let type = event.dataTransfer.getData('application/reactflow');
        let assetId = event.dataTransfer.getData('assetId');
        let sceneIdRef = event.dataTransfer.getData('sceneId');
        let optionId = event.dataTransfer.getData('optionId');

        console.log("Original transfer data:", { type, assetId, sceneIdRef, optionId });

        if (!type) {
            // Fallback parsing of text/plain
            const plainText = event.dataTransfer.getData('text/plain');
            console.log("Attempting fallback text/plain data:", plainText);
            if (plainText) {
                try {
                    const parsed = JSON.parse(plainText);
                    if (parsed && typeof parsed === 'object') {
                        type = parsed.type;
                        assetId = parsed.assetId;
                        sceneIdRef = parsed.sceneId;
                        optionId = parsed.optionId;
                        console.log("Parsed fallback JSON data successfully:", { type, assetId, sceneIdRef, optionId });
                    } else {
                        type = plainText;
                    }
                } catch (e) {
                    type = plainText;
                }
            }
        }

        if (!type) {
            console.warn("Drop ignored: could not resolve drag type");
            return;
        }

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
            console.log("Calculated drop flow position:", position);
        } catch (err) {
            console.error("Error converting screen coordinate to flow position:", err);
        }

        let additionalNodes: any[] = [];
        let additionalEdges: any[] = [];

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
            // Function Node Templates
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
            
            // Auto bind actions
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
                        syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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
                        syncPromptsToCanvas(opt.np_prompt || '', opt.video_prompt || '');
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

        // Prevent duplicates for function nodes
        if (['image-prompt', 'image-output', 'video-prompt', 'video-output', 'first-last-frame'].includes(newNode.id)) {
            const alreadyExists = nodes.some(n => n.id === newNode.id);
            if (alreadyExists) return;
        }

        takeHistorySnapshot();

        const nextNodes = nodes.concat(newNode).concat(additionalNodes);
        const nextEdges = additionalEdges.length > 0 ? edges.concat(additionalEdges) : edges;
        setNodes(nextNodes);
        if (additionalEdges.length > 0) {
            setEdges(nextEdges);
        }
        latestNodesRef.current = nextNodes;
        latestEdgesRef.current = nextEdges;
        
        // Mark pending save — will be handled by the useEffect that watches nodes
        pendingSaveRef.current = true;
    }, [reactFlowInstance, assets, sceneImages, allScenes, activeOption, scene, currentGenStatus, currentVideoStatus, nodes, edges, setEdges]);

    const activeOptionData = getOptionData(activeOption);

    // Process edges to apply marching ants flow animation when target is generating
    const processedEdges = edges.map(edge => {
        const targetNode = nodes.find(n => n.id === edge.target);
        let isGenerating = false;
        
        if (targetNode) {
            if (targetNode.id === 'image-prompt') {
                isGenerating = currentGenStatus === ImageGenStatus.GENERATING;
            } else if (targetNode.id === 'video-prompt') {
                isGenerating = currentVideoStatus === ImageGenStatus.GENERATING;
            } else if (targetNode.id === 'image-output') {
                isGenerating = currentGenStatus === ImageGenStatus.GENERATING;
            } else if (targetNode.id === 'video-output') {
                isGenerating = currentVideoStatus === ImageGenStatus.GENERATING;
            } else if (targetNode.id === 'audio') {
                isGenerating = !!targetNode.data?.ttsLoading;
            }
        }
        
        if (isGenerating) {
            return {
                ...edge,
                animated: true,
                className: 'marching-ants',
                style: {
                    ...edge.style,
                    strokeDasharray: '5,5'
                }
            };
        }
        
        return edge;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex bg-[#0c0c0f] text-gray-200 animate-fadeIn">
            {/* Left Sidebar: Node Library / Toolbox */}
            <div className="w-[260px] border-r border-white/5 bg-[#121216] flex flex-col flex-shrink-0 z-10 select-none">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-100 tracking-wider uppercase">全景工具箱</span>
                    <Layers className="w-4 h-4 text-cyan-400" />
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Draggable Functional Node Templates */}
                    <div className="space-y-2">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">功能节点</span>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'imagePrompt');
                                e.dataTransfer.setData('text/plain', 'imagePrompt');
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-cyan-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-cyan-500/5 transition-all"
                        >
                            <Aperture className="w-4 h-4 text-cyan-400" />
                            image 生成配置节点
                        </div>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'imageOutput');
                                e.dataTransfer.setData('text/plain', 'imageOutput');
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-pink-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-pink-500/5 transition-all"
                        >
                            <ImageIcon className="w-4 h-4 text-pink-400" />
                            image 输出节点
                        </div>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'videoPrompt');
                                e.dataTransfer.setData('text/plain', 'videoPrompt');
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-purple-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-purple-500/5 transition-all"
                        >
                            <Film className="w-4 h-4 text-purple-400" />
                            video 生成配置节点
                        </div>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'videoOutput');
                                e.dataTransfer.setData('text/plain', 'videoOutput');
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-purple-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-purple-500/5 transition-all"
                        >
                            <Film className="w-4 h-4 text-purple-400 animate-pulse" />
                            video 输出播放节点
                        </div>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'firstLastFrame');
                                e.dataTransfer.setData('text/plain', 'firstLastFrame');
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-white/5 bg-[#16161c] hover:border-yellow-500/30 text-xs font-semibold text-gray-300 cursor-grab active:cursor-grabbing hover:bg-yellow-500/5 transition-all"
                        >
                            <Film className="w-4 h-4 text-yellow-400" />
                            首尾帧提取节点
                        </div>
                    </div>

                    {/* Draggable Assets List */}
                    <div className="space-y-2">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">项目资产</span>
                        <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                            {assets.map((asset) => (
                                <div
                                    key={asset.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/reactflow', 'asset');
                                        e.dataTransfer.setData('assetId', asset.id);
                                        e.dataTransfer.setData('text/plain', JSON.stringify({
                                            type: 'asset',
                                            assetId: asset.id
                                        }));
                                    }}
                                    onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoveredItem({
                                            type: 'asset',
                                            data: asset,
                                            rect: {
                                                top: rect.top,
                                                right: rect.right,
                                                bottom: rect.bottom,
                                                left: rect.left
                                            }
                                        });
                                    }}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 cursor-grab active:cursor-grabbing transition-colors"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                    <span className="truncate">{asset.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Draggable Scene candidate list */}
                    <div className="space-y-2">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">分镜引用</span>
                        <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                            {allScenes.filter(s => s.id !== scene.id).flatMap((s) => {
                                const items: { key: string; label: string; sceneId: string; optionId?: string; hasImage: boolean }[] = [];
                                let hasOptions = false;

                                if (s.prompt_options && s.prompt_options.length > 0) {
                                    s.prompt_options.forEach(opt => {
                                        if (opt.imageUrl || opt.imageAssetId) {
                                            hasOptions = true;
                                            items.push({
                                                key: `${s.id}_${opt.option_id}`,
                                                label: `分镜 ${s.id}-${opt.option_id}`,
                                                sceneId: s.id,
                                                optionId: opt.option_id,
                                                hasImage: true
                                            });
                                        }
                                    });
                                }

                                if (!hasOptions) {
                                    items.push({
                                        key: s.id,
                                        label: `分镜 ${s.id}`,
                                        sceneId: s.id,
                                        hasImage: !!(s.imageUrl || s.imageAssetId)
                                    });
                                }

                                return items;
                            }).map((item) => (
                                <div
                                    key={item.key}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/reactflow', 'sceneRef');
                                        e.dataTransfer.setData('sceneId', item.sceneId);
                                        if (item.optionId) {
                                            e.dataTransfer.setData('optionId', item.optionId);
                                        }
                                        e.dataTransfer.setData('text/plain', JSON.stringify({
                                            type: 'sceneRef',
                                            sceneId: item.sceneId,
                                            optionId: item.optionId
                                        }));
                                    }}
                                    onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const matchedScene = allScenes.find(s => s.id === item.sceneId);
                                        setHoveredItem({
                                            type: 'scene',
                                            data: {
                                                ...item,
                                                scene: matchedScene
                                            },
                                            rect: {
                                                top: rect.top,
                                                right: rect.right,
                                                bottom: rect.bottom,
                                                left: rect.left
                                            }
                                        });
                                    }}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 cursor-grab active:cursor-grabbing transition-colors"
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${item.hasImage ? 'bg-green-400' : 'bg-pink-400'}`} />
                                    <span className="truncate">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Canvas Area Container */}
            <div className="flex-1 min-w-0 flex flex-col relative h-full">
                {/* Header Navbar */}
                <div className="h-[60px] border-b border-white/5 bg-[#121216]/80 backdrop-blur-md flex items-center justify-between px-6 z-10">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-gray-100 tracking-wider">全景分镜工坊</h2>
                            <p className="text-[10px] text-gray-400 font-medium">当前场景：S{scene.id}</p>
                        </div>
                    </div>

                    {/* Option Tab Switcher (A/B/C) and Reset Layout */}
                    <div className="flex items-center gap-3">
                        <div className="flex bg-[#1c1c24] border border-white/5 rounded-full p-1 gap-1">
                            {(['A', 'B', 'C'] as const).map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setActiveOption(opt)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                        activeOption === opt 
                                            ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' 
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    方案 {opt}
                                </button>
                            ))}
                        </div>

                        {/* Undo / Redo / Clipboard Toolbar */}
                        <div className="flex bg-[#1c1c24] border border-white/5 rounded-full p-1 gap-1 items-center">
                            <button
                                onClick={undo}
                                disabled={pastCount === 0}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-all cursor-pointer flex items-center justify-center"
                                title="撤销 (Ctrl+Z)"
                            >
                                <Undo className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={futureCount === 0}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400 transition-all cursor-pointer flex items-center justify-center"
                                title="重做 (Ctrl+Y)"
                            >
                                <Redo className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-[1px] h-3.5 bg-white/10 mx-1" />
                            <button
                                onClick={copyNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="复制选中节点 (Ctrl+C)"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={cutNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="剪切选中节点 (Ctrl+X)"
                            >
                                <Scissors className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={pasteNodes}
                                className="p-1.5 rounded-full text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                                title="粘贴节点 (Ctrl+V)"
                            >
                                <Clipboard className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <button
                            onClick={handleResetLayout}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-white/10 hover:border-cyan-500/30 bg-[#1c1c24] hover:bg-white/5 text-xs font-bold text-gray-300 hover:text-white transition-all cursor-pointer"
                            title="清空位置缓存，重置为标准树状布局"
                        >
                            <span>重置布局</span>
                        </button>
                    </div>

                    <button 
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* React Flow Infinite Canvas */}
                <div 
                    className="flex-1 w-full bg-[#0a0a0d]"
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                >
                    <ReactFlow
                        nodes={nodes}
                        edges={processedEdges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={handleConnect}
                        onEdgesDelete={handleEdgesDelete}
                        onNodesDelete={handleNodesDelete}
                        onNodeDragStart={onNodeDragStart}
                        onNodeDragStop={onNodeDragStop}
                        onDoubleClick={(event) => {
                            const target = event.target as HTMLElement;
                            if (target.classList?.contains('react-flow__pane')) {
                                onPaneDoubleClick(event);
                            }
                        }}
                        onInit={setReactFlowInstance}
                        nodeTypes={nodeTypes}
                        proOptions={{ hideAttribution: true }}
                        fitView
                        className="react-flow-dark"
                    >
                        <Background color="#1f1f2e" gap={16} size={1} />
                        <Controls className="!bg-[#121216] !border-white/5 !text-gray-400 [&_button]:!border-white/5 hover:[&_button]:!bg-white/5" />
                        <MiniMap
                            zoomable
                            pannable
                            nodeColor={getMiniMapNodeColor}
                            className="custom-minimap"
                            maskColor="rgba(0, 0, 0, 0.4)"
                        />
                    </ReactFlow>
                </div>

                {/* Bottom Dock Scene Slider (Horizontal navigation) */}
                <div className="h-[120px] border-t border-white/5 bg-[#121216]/90 backdrop-blur-md flex items-center px-6 gap-4 overflow-hidden z-10 shrink-0 select-none">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block w-10 shrink-0">场景<br/>DOCK</span>
                    
                    <div className="flex-1 min-w-0 h-full flex items-center gap-3 overflow-x-auto overflow-y-hidden pt-2 pb-4 pr-4 custom-dock-scrollbar">
                        {allScenes.map((s) => {
                            const isCurrent = s.id === scene.id;
                            const option = activeOption && s.prompt_options ? s.prompt_options.find(o => o.option_id === activeOption) : null;
                            const img = option?.imageUrl || s.imageUrl;

                            return (
                                <div
                                    key={s.id}
                                    onClick={() => onSelectScene(s.id)}
                                    className={`flex-shrink-0 w-[140px] aspect-[16/10] rounded-xl border bg-black/40 overflow-hidden relative cursor-pointer hover:scale-[1.02] hover:border-cyan-500/20 active:scale-[0.98] transition-all flex flex-col ${
                                        isCurrent ? 'border-cyan-500 ring-1 ring-cyan-500/30' : 'border-white/5'
                                    }`}
                                >
                                    {img ? (
                                        <img src={img} alt={`Scene ${s.id}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-gray-600 text-[10px]">
                                            <span>未生成分镜图</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center justify-between gap-1">
                                        <span className="text-[10px] font-bold text-white whitespace-nowrap flex-shrink-0">分镜 {s.id}</span>
                                        <span className="text-[8px] text-gray-400 max-w-[70px] truncate">{s.narration || '暂无内容'}</span>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Add scene trigger */}
                        <div
                            onClick={onAddScene}
                            className="flex-shrink-0 w-[140px] aspect-[16/10] rounded-xl border border-dashed border-white/10 hover:border-cyan-500/30 bg-[#16161e]/50 hover:bg-[#16161e] flex flex-col items-center justify-center gap-1.5 cursor-pointer text-gray-400 hover:text-cyan-400 transition-all active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="text-[10px] font-bold tracking-wider">添加新场景</span>
                        </div>
                    </div>
                </div>
            </div>
            {/* Hover Preview Tooltip/Card */}
            {hoveredItem && (
                <div 
                    style={{
                        position: 'fixed',
                        left: `${hoveredItem.rect.right + 10}px`,
                        top: `${Math.max(10, Math.min(window.innerHeight - 340, hoveredItem.rect.top))}px`,
                    }}
                    className="z-[999] w-[300px] bg-[#16161c]/95 border border-white/10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] backdrop-blur-md overflow-hidden"
                >
                    {hoveredItem.type === 'asset' && (() => {
                        const asset = hoveredItem.data as Asset;
                        const getIcon = () => {
                            switch (asset.type) {
                                case 'character': return <User className="w-4 h-4 text-cyan-400" />;
                                case 'location': return <MapPin className="w-4 h-4 text-emerald-400" />;
                                case 'item': return <Box className="w-4 h-4 text-amber-400" />;
                                case 'video': return <Video className="w-4 h-4 text-purple-400" />;
                                case 'audio': return <Music className="w-4 h-4 text-pink-400" />;
                                default: return <Box className="w-4 h-4 text-gray-400" />;
                            }
                        };
                        const getBorderColor = () => {
                            switch (asset.type) {
                                case 'character': return 'border-cyan-500/30';
                                case 'location': return 'border-emerald-500/30';
                                case 'item': return 'border-amber-500/30';
                                case 'video': return 'border-purple-500/30';
                                case 'audio': return 'border-pink-500/30';
                                default: return 'border-white/10';
                            }
                        };
                        const getTypeName = () => {
                            switch (asset.type) {
                                case 'character': return '角色';
                                case 'location': return '场景';
                                case 'item': return '道具';
                                case 'video': return '视频资产';
                                case 'audio': return '音频资产';
                                default: return '资产';
                            }
                        };
                        const mediaUrl = asset.refImageUrl || undefined;

                        return (
                            <div className={`flex flex-col border-t-2 ${getBorderColor()}`}>
                                {/* Media Section */}
                                {mediaUrl ? (
                                    <div className="w-full aspect-[16/10] bg-black/40 relative overflow-hidden border-b border-white/5">
                                        <img 
                                            src={mediaUrl} 
                                            alt={asset.name} 
                                            className="w-full h-full object-cover" 
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full aspect-[16/10] bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 border-b border-white/5">
                                        <div className="p-3 bg-white/5 rounded-full">
                                            {getIcon()}
                                        </div>
                                        <span className="text-[10px] text-gray-500">无预览图片</span>
                                    </div>
                                )}

                                {/* Details Section */}
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {getIcon()}
                                            <h4 className="text-xs font-bold text-gray-100 truncate max-w-[150px]">{asset.name}</h4>
                                        </div>
                                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 font-semibold uppercase">
                                            {getTypeName()}
                                        </span>
                                    </div>

                                    {asset.description && (
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">描述</span>
                                            <p className="text-[10px] text-gray-300 leading-relaxed max-h-16 overflow-y-auto custom-dock-scrollbar">
                                                {asset.description}
                                            </p>
                                        </div>
                                    )}

                                    {asset.visualDna && (
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">视觉 DNA</span>
                                            <div className="flex flex-wrap gap-1">
                                                {asset.visualDna.split(',').map((tag, idx) => (
                                                    <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-400 border border-cyan-500/10">
                                                        {tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {hoveredItem.type === 'scene' && (() => {
                        const item = hoveredItem.data;
                        const matchedScene = item.scene as Scene | undefined;
                        if (!matchedScene) return null;

                        const option = item.optionId && matchedScene.prompt_options
                            ? matchedScene.prompt_options.find((o: any) => o.option_id === item.optionId)
                            : null;

                        const imageUrl = option?.imageUrl || matchedScene.imageUrl;
                        const npPrompt = option?.np_prompt || matchedScene.np_prompt;
                        const videoPrompt = option?.video_prompt || matchedScene.video_prompt;
                        const narration = matchedScene.narration;

                        return (
                            <div className={`flex flex-col border-t-2 ${imageUrl ? 'border-green-500/30' : 'border-pink-500/30'}`}>
                                {/* Media Section */}
                                {imageUrl ? (
                                    <div className="w-full aspect-[16/10] bg-black/40 relative overflow-hidden border-b border-white/5">
                                        <img 
                                            src={imageUrl} 
                                            alt={item.label} 
                                            className="w-full h-full object-cover" 
                                        />
                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-green-950/80 border border-green-500/30 rounded text-[8px] text-green-300 font-bold uppercase tracking-wider">
                                            图片预览
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full aspect-[16/10] bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 border-b border-white/5">
                                        <div className="p-3 bg-white/5 rounded-full">
                                            <ImageIcon className="w-4 h-4 text-pink-400" />
                                        </div>
                                        <span className="text-[10px] text-gray-500">未生成分镜图</span>
                                    </div>
                                )}

                                {/* Details Section */}
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Film className="w-4 h-4 text-cyan-400" />
                                            <h4 className="text-xs font-bold text-gray-100 truncate max-w-[150px]">{item.label}</h4>
                                        </div>
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                            imageUrl ? 'bg-green-950/30 text-green-400 border border-green-500/10' :
                                            'bg-pink-950/30 text-pink-400 border border-pink-500/10'
                                        }`}>
                                            {imageUrl ? '图片' : '未生成'}
                                        </span>
                                    </div>

                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};
