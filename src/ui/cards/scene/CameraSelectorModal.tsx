import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Camera, Disc, Eye, Check, X } from 'lucide-react';

interface CameraSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (camera: string, lens: string, focalLength: string, aperture: string) => void;
    initialCamera?: string;
    initialLens?: string;
    initialFocalLength?: string;
    initialAperture?: string;
}

const CAMERAS = ['None', 'Arri Alexa Mini LF', 'Red V-Raptor', 'Sony Venice 2', 'Panavision DXL2', 'BMD Ursa Mini Pro', 'Canon C500 Mk II'];
const LENSES = ['None', 'Arri Signature Prime', 'Zeiss Supreme Prime', 'Cooke SF 1.8x', 'Panavision Primo', 'Leica Summilux-C', 'Angenieux Optimo'];
const FOCAL_LENGTHS = ['None', '18', '24', '35', '50', '75', '85', '100', '125', '135', '150'];
const APERTURES = ['None', 'f/1.2', 'f/1.4', 'f/1.8', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0', 'f/11', 'f/16'];

export const CameraSelectorModal: React.FC<CameraSelectorModalProps> = ({
    isOpen,
    onClose,
    onApply,
    initialCamera = 'None',
    initialLens = 'None',
    initialFocalLength = 'None',
    initialAperture = 'None',
}) => {
    // Find index, default to 0 if not found
    const getIndex = (list: string[], val: string) => {
        const idx = list.findIndex(item => item.toLowerCase() === val.toLowerCase());
        return idx === -1 ? 0 : idx;
    };

    const [camIdx, setCamIdx] = useState(0);
    const [lensIdx, setLensIdx] = useState(0);
    const [focalIdx, setFocalIdx] = useState(0);
    const [apertureIdx, setApertureIdx] = useState(0);

    const cameraColRef = useRef<HTMLDivElement>(null);
    const lensColRef = useRef<HTMLDivElement>(null);
    const focalColRef = useRef<HTMLDivElement>(null);
    const apertureColRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setCamIdx(getIndex(CAMERAS, initialCamera));
            setLensIdx(getIndex(LENSES, initialLens));
            setFocalIdx(getIndex(FOCAL_LENGTHS, initialFocalLength));
            setApertureIdx(getIndex(APERTURES, initialAperture));
        }
    }, [isOpen, initialCamera, initialLens, initialFocalLength, initialAperture]);

    useEffect(() => {
        if (!isOpen) return;

        const setupWheel = (
            ref: React.RefObject<HTMLDivElement | null>,
            list: string[],
            setIdx: React.Dispatch<React.SetStateAction<number>>
        ) => {
            const el = ref.current;
            if (!el) return;

            const listener = (e: WheelEvent) => {
                e.preventDefault();
                const direction = e.deltaY < 0 ? 'up' : 'down';
                setIdx((prev) => {
                    if (direction === 'up') {
                        return prev === 0 ? list.length - 1 : prev - 1;
                    } else {
                        return prev === list.length - 1 ? 0 : prev + 1;
                    }
                });
            };

            el.addEventListener('wheel', listener, { passive: false });
            return () => {
                el.removeEventListener('wheel', listener);
            };
        };

        const cleanCamera = setupWheel(cameraColRef, CAMERAS, setCamIdx);
        const cleanLens = setupWheel(lensColRef, LENSES, setLensIdx);
        const cleanFocal = setupWheel(focalColRef, FOCAL_LENGTHS, setFocalIdx);
        const cleanAperture = setupWheel(apertureColRef, APERTURES, setApertureIdx);

        return () => {
            cleanCamera?.();
            cleanLens?.();
            cleanFocal?.();
            cleanAperture?.();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const cycleValue = (list: string[], currentIdx: number, direction: 'up' | 'down') => {
        if (direction === 'up') {
            return currentIdx === 0 ? list.length - 1 : currentIdx - 1;
        } else {
            return currentIdx === list.length - 1 ? 0 : currentIdx + 1;
        }
    };

    const handleApply = () => {
        onApply(
            CAMERAS[camIdx],
            LENSES[lensIdx],
            FOCAL_LENGTHS[focalIdx],
            APERTURES[apertureIdx]
        );
        onClose();
    };

    const renderColumn = (
        title: string,
        icon: React.ReactNode,
        list: string[],
        currentIdx: number,
        setIdx: React.Dispatch<React.SetStateAction<number>>,
        colRef: React.RefObject<HTMLDivElement | null>,
        widthClass: string = 'flex-1 min-w-[160px]'
    ) => {
        const prevIdx = currentIdx === 0 ? list.length - 1 : currentIdx - 1;
        const nextIdx = currentIdx === list.length - 1 ? 0 : currentIdx + 1;

        return (
            <div 
                ref={colRef}
                className={`flex flex-col items-center select-none ${widthClass} bg-black/40 dark:bg-black/60 rounded-xl p-2 border border-white/5`}
            >
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-2 tracking-wider uppercase flex items-center gap-1">
                    {icon}
                    {title}
                </span>

                {/* Chevron Up */}
                <button
                    onClick={() => setIdx(cycleValue(list, currentIdx, 'up'))}
                    className="p-1 text-gray-500 hover:text-cyan-400 hover:bg-white/5 rounded transition-all mb-1"
                >
                    <ChevronUp className="w-5 h-5" />
                </button>

                {/* Wheel Values Container */}
                <div className="flex flex-col items-center justify-center h-[120px] w-full relative overflow-hidden py-1">
                    {/* Shadow overlays */}
                    <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[#151518]/90 to-transparent pointer-events-none z-10" />
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#151518]/90 to-transparent pointer-events-none z-10" />

                    {/* Active highlighted background marker */}
                    <div className="absolute top-1/2 -translate-y-1/2 left-1 right-1 h-9 rounded bg-cyan-500/10 border-y border-cyan-500/20 pointer-events-none" />

                    {/* Dimmed Prev */}
                    <div 
                        onClick={() => setIdx(prevIdx)}
                        className="h-8 flex items-center text-xs text-gray-600 dark:text-gray-500 cursor-pointer hover:text-gray-400 transition-colors w-full px-2 min-w-0"
                    >
                        <span className="truncate w-full text-center block">
                            {list[prevIdx] === 'None' ? '—' : list[prevIdx]}
                        </span>
                    </div>

                    {/* Active Current */}
                    <div className="h-10 flex items-center text-sm font-bold text-cyan-400 dark:text-cyan-400 z-20 w-full px-2 min-w-0">
                        <span className="truncate w-full text-center block">
                            {list[currentIdx] === 'None' ? '—' : list[currentIdx]}
                        </span>
                    </div>

                    {/* Dimmed Next */}
                    <div 
                        onClick={() => setIdx(nextIdx)}
                        className="h-8 flex items-center text-xs text-gray-600 dark:text-gray-500 cursor-pointer hover:text-gray-400 transition-colors w-full px-2 min-w-0"
                    >
                        <span className="truncate w-full text-center block">
                            {list[nextIdx] === 'None' ? '—' : list[nextIdx]}
                        </span>
                    </div>
                </div>

                {/* Chevron Down */}
                <button
                    onClick={() => setIdx(cycleValue(list, currentIdx, 'down'))}
                    className="p-1 text-gray-500 hover:text-cyan-400 hover:bg-white/5 rounded transition-all mt-1"
                >
                    <ChevronDown className="w-5 h-5" />
                </button>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
            {/* Modal Box */}
            <div className="relative w-full max-w-3xl bg-[#151518] dark:bg-[#111113] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#1a1a1f] dark:bg-[#17171a]">
                    <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-sm font-bold text-white tracking-wide">电影级摄像机参数设定</h3>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body (Selector Columns) */}
                <div className="p-6 flex flex-wrap gap-4 justify-between bg-[#151518]">
                    {renderColumn('机身', <Camera className="w-3 h-3 text-cyan-500" />, CAMERAS, camIdx, setCamIdx, cameraColRef, 'min-w-[210px] flex-[2]')}
                    {renderColumn('镜头', <Disc className="w-3 h-3 text-emerald-500" />, LENSES, lensIdx, setLensIdx, lensColRef, 'min-w-[210px] flex-[2]')}
                    {renderColumn('焦距 (mm)', <Eye className="w-3 h-3 text-amber-500" />, FOCAL_LENGTHS, focalIdx, setFocalIdx, focalColRef, 'min-w-[90px] flex-1')}
                    {renderColumn('光圈', <Disc className="w-3 h-3 text-purple-500" />, APERTURES, apertureIdx, setApertureIdx, apertureColRef, 'min-w-[90px] flex-1')}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/5 bg-[#1a1a1f] dark:bg-[#17171a]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
                    >
                        <Check className="w-4 h-4 stroke-[3]" />
                        使用参数
                    </button>
                </div>

            </div>
        </div>
    );
};
