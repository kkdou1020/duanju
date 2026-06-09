import { useEffect } from 'react';

interface UseCanvasShortcutsProps {
    undo: () => void;
    redo: () => void;
    copyNodes: () => void;
    cutNodes: () => void;
    pasteNodes: () => void;
}

export function useCanvasShortcuts({
    undo,
    redo,
    copyNodes,
    cutNodes,
    pasteNodes,
}: UseCanvasShortcutsProps) {
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const isModifier = e.ctrlKey || e.metaKey;
            if (!isModifier) return;

            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName?.toLowerCase();
            const isEditing = tag === 'input' || 
                              tag === 'textarea' || 
                              tag === 'select' || 
                              (active ? (active as any).isContentEditable === true : false);
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
}
