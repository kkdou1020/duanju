import React from 'react';
import { Scene } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Copy, Download, Mic, Trash2, Layers } from 'lucide-react';

interface SceneHeaderProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    ttsLoading: boolean;
    audioUrl: string | null;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    onNarrationTTS: () => void;
    onDownloadAudio: () => void;
    onOpenCanvas?: () => void;
}

const SceneHeader: React.FC<SceneHeaderProps> = ({
    scene,
    labels,
    onUpdate,
    onDelete,
    onDuplicate,
    ttsLoading,
    audioUrl,
    audioRef,
    onNarrationTTS,
    onDownloadAudio,
    onOpenCanvas,
}) => {
    return (
        <div className="p-4 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/5 flex flex-col gap-2">
            <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-banana-500 bg-indigo-100 dark:bg-banana-500/10 px-2 py-0.5 rounded">
                    {labels.scene} {scene.id}
                </span>
                <div className="flex-1 flex gap-2 items-center flex-wrap">
                    <input
                        value={scene.narration}
                        onChange={(e) => onUpdate(scene.id, 'narration', e.target.value)}
                        className="flex-1 min-w-[180px] bg-transparent border-none text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-600"
                        placeholder="Narration..."
                    />

                    {/* Narration Generation Button */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={onNarrationTTS}
                            disabled={ttsLoading || !scene.narration}
                            className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${ttsLoading ? 'bg-gray-400 dark:bg-gray-600 text-white' : 'bg-indigo-600 dark:bg-banana-500/20 text-white dark:text-banana-400 hover:bg-indigo-700 dark:hover:bg-banana-500/30'}`}
                            title="Generate Narration Audio"
                        >
                            {ttsLoading ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Mic className="w-3 h-3" />}
                            {labels.dialogueBtn}
                        </button>

                        {audioUrl && (
                            <button
                                onClick={onDownloadAudio}
                                className="p-1.5 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded transition-colors"
                                title="Download Audio"
                            >
                                <Download className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {onDuplicate && (
                        <button
                            onClick={() => onDuplicate(scene.id)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-banana-500 transition-colors rounded hover:bg-gray-200 dark:hover:bg-white/5"
                            title={labels.copy}
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {/* Delete Scene Button */}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(scene.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-500 hover:text-red-600 dark:hover:text-red-500 rounded transition-colors"
                            title="Delete Scene"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <audio ref={audioRef} className="hidden" controls />
        </div>
    );
};

export default SceneHeader;
