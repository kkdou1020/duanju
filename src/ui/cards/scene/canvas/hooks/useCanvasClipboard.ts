import React, { useCallback } from 'react';

interface UseCanvasClipboardProps {
    latestNodesRef: React.MutableRefObject<any[]>;
    latestEdgesRef: React.MutableRefObject<any[]>;
    setNodes: React.Dispatch<React.SetStateAction<any[]>>;
    setEdges: React.Dispatch<React.SetStateAction<any[]>>;
    takeHistorySnapshot: () => void;
    pendingSaveRef: React.MutableRefObject<boolean>;
    debouncedSaveLayout: () => void;
}

export function useCanvasClipboard({
    latestNodesRef,
    latestEdgesRef,
    setNodes,
    setEdges,
    takeHistorySnapshot,
    pendingSaveRef,
    debouncedSaveLayout,
}: UseCanvasClipboardProps) {
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
    }, [latestNodesRef, latestEdgesRef]);

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
    }, [takeHistorySnapshot, setNodes, setEdges, pendingSaveRef, debouncedSaveLayout, latestNodesRef, latestEdgesRef]);

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
    }, [takeHistorySnapshot, setNodes, setEdges, pendingSaveRef, debouncedSaveLayout, latestNodesRef, latestEdgesRef]);

    return {
        copyNodes,
        cutNodes,
        pasteNodes,
    };
}
