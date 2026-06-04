import React, { useState, useRef, useEffect } from 'react';
import { Pin, Trash2, Check, Edit2 } from 'lucide-react';

interface CustomNoteNodeProps {
    id: string;
    data: {
        text: string;
        color?: 'yellow' | 'green' | 'blue';
        onUpdate: (field: string, value: any) => void;
        onDelete: () => void;
    };
}

export const CustomNoteNode: React.FC<CustomNoteNodeProps> = ({ id, data }) => {
    const { text, color = 'yellow', onUpdate, onDelete } = data;
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(text);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        setEditText(text);
    }, [text]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        setIsEditing(false);
        if (editText.trim() !== text) {
            onUpdate('text', editText);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    // Color definitions
    const colorClasses = {
        yellow: {
            border: 'border-amber-500/30',
            bg: 'bg-amber-950/40',
            glow: 'shadow-amber-500/5',
            text: 'text-amber-200',
            dot: 'bg-amber-400 ring-amber-400/30',
            accent: 'text-amber-400'
        },
        green: {
            border: 'border-emerald-500/30',
            bg: 'bg-emerald-950/40',
            glow: 'shadow-emerald-500/5',
            text: 'text-emerald-200',
            dot: 'bg-emerald-400 ring-emerald-400/30',
            accent: 'text-emerald-400'
        },
        blue: {
            border: 'border-cyan-500/30',
            bg: 'bg-cyan-950/40',
            glow: 'shadow-cyan-500/5',
            text: 'text-cyan-200',
            dot: 'bg-cyan-400 ring-cyan-400/30',
            accent: 'text-cyan-400'
        }
    };

    const activeColor = colorClasses[color] || colorClasses.yellow;

    return (
        <div 
            className={`relative flex flex-col gap-2 p-3.5 rounded-2xl border ${activeColor.border} ${activeColor.bg} backdrop-blur-md shadow-2xl ${activeColor.glow} w-[240px] transition-all duration-300`}
            onDoubleClick={(e) => {
                e.stopPropagation(); // Avoid triggering canvas level double click
                setIsEditing(true);
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 select-none">
                <div className="flex items-center gap-1.5">
                    <Pin className={`w-3.5 h-3.5 ${activeColor.accent}`} />
                    <span className="text-[10px] font-bold text-gray-300 tracking-wider uppercase">便签 Note</span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-red-400 transition-colors"
                    title="删除便签"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Note text / editor */}
            <div className="min-h-[60px] flex flex-col">
                {isEditing ? (
                    <div className="flex flex-col gap-1.5">
                        <textarea
                            ref={textareaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            rows={3}
                            placeholder="输入便签内容... (Enter保存, Shift+Enter换行)"
                            className="w-full text-xs bg-[#16161a]/95 border border-white/10 rounded-lg p-2 text-gray-200 outline-none focus:border-cyan-500 resize-none font-sans"
                        />
                        <button
                            onMouseDown={(e) => {
                                // Use onMouseDown to prevent blur before save triggers
                                e.preventDefault();
                                handleSave();
                            }}
                            className="self-end flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-black bg-cyan-400 hover:bg-cyan-300 transition-colors"
                        >
                            <Check className="w-3 h-3" />
                            保存
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1 group cursor-text">
                        <p className={`text-xs ${activeColor.text} whitespace-pre-wrap break-words leading-relaxed select-text font-sans`}>
                            {text || '双击编辑此便签...'}
                        </p>
                        <div className="self-end opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditing(true);
                                }}
                                className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <Edit2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Color Selectors */}
            <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1 select-none">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">底色</span>
                <div className="flex items-center gap-2">
                    {(['yellow', 'green', 'blue'] as const).map((c) => (
                        <button
                            key={c}
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate('color', c);
                            }}
                            className={`w-3.5 h-3.5 rounded-full ${colorClasses[c].dot} border border-white/10 transition-all ${
                                color === c ? 'ring-2 ring-offset-2 ring-offset-black scale-110' : 'hover:scale-105'
                            }`}
                            title={`切换为 ${c === 'yellow' ? '黄' : c === 'green' ? '绿' : '蓝'}色`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
