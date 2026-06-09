import React, { useState, useCallback, useRef } from 'react';
import { Scene } from '@/shared/types';

export interface CanvasHistoryState {
    nodes: any[];
    edges: any[];
    prompts?: {
        np_prompt: string;
        video_prompt: string;
        activeOption: string;
    };
}

interface UseCanvasHistoryProps {
    latestNodesRef: React.MutableRefObject<any[]>;
    latestEdgesRef: React.MutableRefObject<any[]>;
    setNodes: React.Dispatch<React.SetStateAction<any[]>>;
    setEdges: React.Dispatch<React.SetStateAction<any[]>>;
    activeOption: 'A' | 'B' | 'C';
    sceneId: string;
    onSceneUpdate: (sceneId: string, updates: any) => void;
    getOptionData: (optionId: string) => any;
    syncEdgesToPromptText: (restoredNodes: any[], restoredEdges: any[]) => void;
    pendingSaveRef: React.MutableRefObject<boolean>;
    debouncedSaveLayout: () => void;
}

export function useCanvasHistory({
    latestNodesRef,
    latestEdgesRef,
    setNodes,
    setEdges,
    activeOption,
    sceneId,
    onSceneUpdate,
    getOptionData,
    syncEdgesToPromptText,
    pendingSaveRef,
    debouncedSaveLayout,
}: UseCanvasHistoryProps) {
    const historyRef = useRef<{
        past: CanvasHistoryState[];
        future: CanvasHistoryState[];
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

        const option = getOptionData(activeOption);
        const snapshotPrompts = {
            np_prompt: option.np_prompt || '',
            video_prompt: option.video_prompt || '',
            activeOption
        };

        historyRef.current.past.push({
            nodes: snapshotNodes,
            edges: snapshotEdges,
            prompts: snapshotPrompts
        });
        if (historyRef.current.past.length > 50) {
            historyRef.current.past.shift();
        }
        historyRef.current.future = [];

        setPastCount(historyRef.current.past.length);
        setFutureCount(0);
    }, [activeOption, getOptionData, latestNodesRef, latestEdgesRef]);

    const undo = useCallback(() => {
        const past = historyRef.current.past;
        if (past.length === 0) return;

        const option = getOptionData(activeOption);
        const currentSnapshot = {
            nodes: latestNodesRef.current.map(n => ({
                ...n,
                position: { ...n.position },
                data: { ...n.data }
            })),
            edges: latestEdgesRef.current.map(e => ({ ...e })),
            prompts: {
                np_prompt: option.np_prompt || '',
                video_prompt: option.video_prompt || '',
                activeOption
            }
        };

        const previousSnapshot = past.pop()!;
        historyRef.current.future.push(currentSnapshot);

        setNodes(previousSnapshot.nodes);
        setEdges(previousSnapshot.edges);

        latestNodesRef.current = previousSnapshot.nodes;
        latestEdgesRef.current = previousSnapshot.edges;

        setPastCount(past.length);
        setFutureCount(historyRef.current.future.length);

        if (previousSnapshot.prompts) {
            const { np_prompt, video_prompt, activeOption: snapOpt } = previousSnapshot.prompts;
            onSceneUpdate(sceneId, (prev: Scene) => {
                const options = prev.prompt_options ? [...prev.prompt_options] : [];
                let optIdx = options.findIndex(o => o.option_id === snapOpt);
                if (optIdx !== -1) {
                    options[optIdx] = {
                        ...options[optIdx],
                        np_prompt,
                        video_prompt
                    };
                }
                const updates: Partial<Scene> = { prompt_options: options };
                if (snapOpt === 'A') {
                    updates.np_prompt = np_prompt;
                    updates.video_prompt = video_prompt;
                }
                return updates;
            });
        } else {
            syncEdgesToPromptText(previousSnapshot.nodes, previousSnapshot.edges);
        }

        pendingSaveRef.current = true;
        debouncedSaveLayout();
    }, [setNodes, setEdges, debouncedSaveLayout, syncEdgesToPromptText, activeOption, getOptionData, onSceneUpdate, sceneId, latestNodesRef, latestEdgesRef]);

    const redo = useCallback(() => {
        const future = historyRef.current.future;
        if (future.length === 0) return;

        const option = getOptionData(activeOption);
        const currentSnapshot = {
            nodes: latestNodesRef.current.map(n => ({
                ...n,
                position: { ...n.position },
                data: { ...n.data }
            })),
            edges: latestEdgesRef.current.map(e => ({ ...e })),
            prompts: {
                np_prompt: option.np_prompt || '',
                video_prompt: option.video_prompt || '',
                activeOption
            }
        };

        const nextSnapshot = future.pop()!;
        historyRef.current.past.push(currentSnapshot);

        setNodes(nextSnapshot.nodes);
        setEdges(nextSnapshot.edges);

        latestNodesRef.current = nextSnapshot.nodes;
        latestEdgesRef.current = nextSnapshot.edges;

        setPastCount(historyRef.current.past.length);
        setFutureCount(future.length);

        if (nextSnapshot.prompts) {
            const { np_prompt, video_prompt, activeOption: snapOpt } = nextSnapshot.prompts;
            onSceneUpdate(sceneId, (prev: Scene) => {
                const options = prev.prompt_options ? [...prev.prompt_options] : [];
                let optIdx = options.findIndex(o => o.option_id === snapOpt);
                if (optIdx !== -1) {
                    options[optIdx] = {
                        ...options[optIdx],
                        np_prompt,
                        video_prompt
                    };
                }
                const updates: Partial<Scene> = { prompt_options: options };
                if (snapOpt === 'A') {
                    updates.np_prompt = np_prompt;
                    updates.video_prompt = video_prompt;
                }
                return updates;
            });
        } else {
            syncEdgesToPromptText(nextSnapshot.nodes, nextSnapshot.edges);
        }

        pendingSaveRef.current = true;
        debouncedSaveLayout();
    }, [setNodes, setEdges, debouncedSaveLayout, syncEdgesToPromptText, activeOption, getOptionData, onSceneUpdate, sceneId, latestNodesRef, latestEdgesRef]);

    return {
        undo,
        redo,
        takeHistorySnapshot,
        pastCount,
        futureCount,
    };
}
