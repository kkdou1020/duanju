import React from 'react';
import { Scene } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { MessageSquare, Music, Plus, Trash2 } from 'lucide-react';

interface SceneDialoguePaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
}

const SceneDialoguePane: React.FC<SceneDialoguePaneProps> = ({
    scene,
    labels,
    onUpdate,
}) => {
    return (
        <div className="bg-gray-100 dark:bg-black/20 p-2 h-[120px] overflow-y-auto">
            <div className="flex items-center justify-between mb-1 sticky top-0 bg-gray-100/90 dark:bg-black/20 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3 h-3 text-green-400" />
                    <h4 className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{labels.dialogueLabel}</h4>
                </div>
                <button
                    onClick={() => {
                        const newDialogue = [...(scene.audio_dialogue || []), { speaker: 'Role', text: 'Content...' }];
                        onUpdate(scene.id, 'audio_dialogue', newDialogue);
                    }}
                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                    title="Add Dialogue Line"
                >
                    <Plus className="w-3 h-3" />
                </button>
            </div>

            {/* Dialogue List - Editable */}
            <div className="space-y-1 mb-1">
                {scene.audio_dialogue && scene.audio_dialogue.length > 0 ? (
                    scene.audio_dialogue.map((line, idx) => (
                        <div key={idx} className="flex gap-1 text-[10px] items-center group/line">
                            <input
                                className="font-bold text-indigo-600 dark:text-banana-500 bg-transparent border-none outline-none w-16 text-right focus:bg-gray-200 dark:focus:bg-white/5 rounded px-1"
                                value={line.speaker}
                                onChange={(e) => {
                                    const newDialogue = [...(scene.audio_dialogue || [])];
                                    newDialogue[idx] = { ...newDialogue[idx], speaker: e.target.value };
                                    onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                }}
                            />
                            <span className="text-gray-500">:</span>
                            <input
                                className="text-gray-700 dark:text-gray-400 bg-transparent border-none outline-none flex-1 focus:bg-gray-200 dark:focus:bg-white/5 rounded px-1"
                                value={line.text}
                                onChange={(e) => {
                                    const newDialogue = [...(scene.audio_dialogue || [])];
                                    newDialogue[idx] = { ...newDialogue[idx], text: e.target.value };
                                    onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                }}
                            />
                            <button
                                onClick={() => {
                                    const newDialogue = [...(scene.audio_dialogue || [])];
                                    newDialogue.splice(idx, 1);
                                    onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                }}
                                className="opacity-0 group-hover/line:opacity-100 text-red-500/50 hover:text-red-500 transition-opacity p-0.5"
                            >
                                <Trash2 className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="text-[10px] text-gray-400 dark:text-gray-600 italic pl-2">No dialogue.</div>
                )}
            </div>

            {/* SFX / BGM */}
            <div className="flex flex-col gap-1 text-[10px] text-gray-500 border-t border-gray-200 dark:border-white/5 pt-1 mt-1">
                <div className="flex items-center gap-2 group/sfx">
                    <Music className="w-2.5 h-2.5 text-gray-600 group-focus-within/sfx:text-indigo-600 dark:group-focus-within/sfx:text-banana-500" />
                    <span className="w-6 shrink-0 truncate">{labels.sfxLabel}:</span>
                    <input
                        value={scene.audio_sfx || ''}
                        onChange={(e) => onUpdate(scene.id, 'audio_sfx', e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-white/10 focus:border-indigo-500 dark:focus:border-banana-500 outline-none flex-1 text-gray-700 dark:text-gray-400 transition-colors px-1"
                        placeholder="SFX..."
                    />
                </div>
                <div className="flex items-center gap-2 group/bgm">
                    <Music className="w-2.5 h-2.5 text-gray-600 opacity-50 group-focus-within/bgm:text-indigo-600 dark:group-focus-within/bgm:text-banana-500 group-focus-within/bgm:opacity-100" />
                    <span className="w-6 shrink-0 truncate">BGM:</span>
                    <input
                        value={scene.audio_bgm || ''}
                        onChange={(e) => onUpdate(scene.id, 'audio_bgm', e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-white/10 focus:border-indigo-500 dark:focus:border-banana-500 outline-none flex-1 text-gray-700 dark:text-gray-400 transition-colors px-1"
                        placeholder="BGM..."
                    />
                </div>
            </div>
        </div>
    );
};

export default SceneDialoguePane;
