import React, { createContext, useContext } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Scene, Asset, ImageGenStatus } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';

export interface CanvasContextType {
    scene: Scene;
    allScenes: Scene[];
    assets: Asset[];
    activeOption: 'A' | 'B' | 'C';
    setActiveOption: (opt: 'A' | 'B' | 'C') => void;
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    onNodesChange: any;
    onEdgesChange: any;
    reactFlowInstance: any;
    setReactFlowInstance: (instance: any) => void;
    
    // 历史记录
    undo: () => void;
    redo: () => void;
    pastCount: number;
    futureCount: number;
    
    // 剪贴板
    copyNodes: () => void;
    cutNodes: () => void;
    pasteNodes: () => void;
    
    // 画布控制
    handleResetLayout: () => void;
    onPaneDoubleClick: (event: React.MouseEvent) => void;
    onNodeDragStart: () => void;
    onNodeDragStop: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    
    // 弹窗状态
    onClose: () => void;
    showSettingsModal: boolean;
    setShowSettingsModal: (show: boolean) => void;
    hoveredItem: any;
    setHoveredItem: (item: any) => void;
    language: string;
    labels: Translation;
    
    // API 生成与媒体上传回调
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
}

const CanvasContext = createContext<CanvasContextType | null>(null);

export const CanvasProvider: React.FC<{ value: CanvasContextType; children: React.ReactNode }> = ({ value, children }) => {
    return (
        <CanvasContext.Provider value={value}>
            {children}
        </CanvasContext.Provider>
    );
};

export const useCanvas = () => {
    const context = useContext(CanvasContext);
    if (!context) {
        throw new Error('useCanvas must be used within a CanvasProvider');
    }
    return context;
};
