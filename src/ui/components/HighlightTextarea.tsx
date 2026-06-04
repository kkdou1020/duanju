import React, { useRef, useEffect } from 'react';

interface HighlightTextareaProps {
    value: string;
    onChange: (val: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    className?: string;
    minHeight?: string;
    maxHeight?: string;
}

export const HighlightTextarea: React.FC<HighlightTextareaProps> = ({
    value,
    onChange,
    onBlur,
    placeholder = '输入内容...',
    className = '',
    minHeight = '120px',
    maxHeight = '240px',
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    // Sync scrolling from textarea to backdrop
    const handleScroll = () => {
        if (textareaRef.current && backdropRef.current) {
            backdropRef.current.scrollTop = textareaRef.current.scrollTop;
            backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
    };

    // Ensure scroll is synced on mount/update
    useEffect(() => {
        handleScroll();
    }, [value]);

    const renderBackdropText = (text: string) => {
        if (!text) {
            return <span className="text-gray-400 dark:text-gray-600 italic select-none">{placeholder}</span>;
        }

        const parts = [];
        const regex = /\[@图像_([^#\]]+)(?:#([a-zA-Z0-9_\-]+))?\]/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const index = match.index;
            if (index > lastIndex) {
                parts.push(text.substring(lastIndex, index));
            }
            const displayName = match[1];
            const assetId = match[2];
            parts.push({ displayName, assetId, raw: match[0] });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts.map((part, i) => {
            if (typeof part === 'string') {
                return (
                    <span key={i} className="text-slate-800 dark:text-gray-200">
                        {part}
                    </span>
                );
            } else {
                // Keep the exact same text length and character spacing to prevent any cursor misalignment
                const raw = part.raw;
                const prefix = '[@图像_';
                const name = part.displayName;
                const suffix = part.assetId ? `#${part.assetId}]` : ']';

                return (
                    <span
                        key={i}
                        className="bg-indigo-500/10 dark:bg-banana-500/10 text-indigo-500 dark:text-banana-400 rounded select-all"
                    >
                        <span className="opacity-30 dark:opacity-20 font-normal select-none">{prefix}</span>
                        <span className="font-bold text-indigo-600 dark:text-banana-400 select-all">{name}</span>
                        <span className="opacity-30 dark:opacity-20 font-normal select-none">{suffix}</span>
                    </span>
                );
            }
        });
    };

    return (
        <div 
            className={`relative rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-black/60 shadow-inner ${className}`}
            style={{ minHeight, maxHeight }}
        >
            {/* Backdrop Layer: Contains styled text with transparent text for normal text and solid colors for tags */}
            <div
                ref={backdropRef}
                className="absolute inset-0 w-full h-full font-mono text-sm leading-relaxed p-3.5 m-0 border-none overflow-y-auto whitespace-pre-wrap break-all pointer-events-none select-none"
                style={{ 
                    minHeight, 
                    maxHeight,
                    boxSizing: 'border-box',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                }}
            >
                {renderBackdropText(value)}
            </div>

            {/* Interactive Textarea Layer: Positioned on top, text is completely transparent but cursor is visible */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                onBlur={onBlur}
                placeholder={value ? '' : placeholder} // hide native placeholder if value exists
                className="absolute inset-0 w-full h-full font-mono text-sm leading-relaxed p-3.5 m-0 bg-transparent resize-none outline-none overflow-y-auto border-none text-transparent caret-indigo-600 dark:caret-banana-500 break-all select-text"
                style={{ 
                    minHeight, 
                    maxHeight,
                    boxSizing: 'border-box',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    WebkitTextFillColor: 'transparent' // ensures text transparency in safari/chrome
                }}
            />
        </div>
    );
};
