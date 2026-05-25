import React, { useState, useRef, useEffect } from 'react';
import { AnalysisStatus, Asset, GlobalStyle } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Sparkles, Play, Trash2, FileText, Database, Upload, BookOpen, Palette, RefreshCw } from 'lucide-react';
import AssetLibrary from '@/ui/panels/asset-library/AssetLibrary';
import StylePanel from '@/ui/panels/StylePanel';

interface InputPanelProps {
  onAnalyze: (text: string, episodeCount?: number, isRegenerate?: boolean) => void;
  onLoadNovel: (text: string, filename: string, episodeCount?: number) => void;
  novelStatus: { hasNovel: boolean; filename: string; progress: string };
  status: AnalysisStatus;
  labels: Translation;
  assets: Asset[];
  // Replaced generic setter with specific handlers for better state control
  onUpdateAsset: (asset: Asset) => void;
  onAddAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onExtractAssets: (text: string) => void;
  styleState: GlobalStyle;
  onStyleChange: (style: GlobalStyle) => void;
  language?: string;
  onImportFromGlobal?: () => void;
  progressMessage?: string;
  initialText?: string;
}

const InputPanel: React.FC<InputPanelProps> = ({
  onAnalyze,
  onLoadNovel,
  novelStatus,
  status,
  labels,
  assets,
  onUpdateAsset,
  onAddAsset,
  onDeleteAsset,
  onExtractAssets,
  styleState,
  onStyleChange,
  language = "Chinese",
  onImportFromGlobal,
  progressMessage,
  initialText
}) => {
  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<'style' | 'script' | 'assets'>('style');
  const [episodeCount, setEpisodeCount] = useState<number | ''>(''); // '' means Auto

  // New State for Dropdown Logic
  const [episodeMode, setEpisodeMode] = useState<'auto' | '10' | '20' | '30' | 'custom'>('auto');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialText && !text) {
      setText(initialText);
    }
  }, [initialText]);

  // Sync mode with episodeCount changes if needed (optional, but good for consistency)
  // For now, we drive episodeCount from the UI handlers.

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value as 'auto' | '10' | '20' | '30' | 'custom';
    setEpisodeMode(mode);

    if (mode === 'auto') {
      setEpisodeCount('');
    } else if (mode === 'custom') {
      // Keep current value if it's a number, otherwise reset to empty (or 1?)
      // Let's keep it empty or last valid.
      if (typeof episodeCount !== 'number') setEpisodeCount('');
    } else {
      setEpisodeCount(parseInt(mode));
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      setEpisodeCount('');
      return;
    }

    const num = parseInt(val);
    if (!isNaN(num) && num >= 0 && num <= 99) {
      setEpisodeCount(num);
    }
  };

  const handleAnalyzeClick = () => {
    if (text.trim() || novelStatus.hasNovel) {
      onAnalyze(text, typeof episodeCount === 'number' ? episodeCount : undefined, novelStatus.hasNovel);
    }
  };

  const handleExtractClick = () => {
    if (text.trim()) {
      onExtractAssets(text);
    } else if (novelStatus.hasNovel) {
      // Novel loaded but local textarea is empty (e.g., session restore)
      // Pass empty string — parent will fall back to chunk/novel text
      onExtractAssets('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      // We pass the current episodeCount state here. 
      // Note: If user changes file, they might want to adjust episode count first, but usually they pick file then count.
      // However, onLoadNovel usually triggers analysis immediately in App.tsx. 
      // We should probably allow the user to set count BEFORE loading, or pass it.
      onLoadNovel(content, file.name, typeof episodeCount === 'number' ? episodeCount : undefined);
      setText(content.substring(0, 100000) + (content.length > 100000 ? "\n\n...[内容过长，仅展示前10万字]" : "")); // Preview
      setActiveTab('script'); // Switch to script tab on load
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isProcessing = status === AnalysisStatus.ANALYZING || status === AnalysisStatus.EXTRACTING;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-white/10 shadow-md dark:shadow-xl overflow-hidden transition-colors duration-300">

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20">
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 py-3 px-2 text-xs md:text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'style' ? 'text-indigo-600 dark:text-banana-400 bg-white dark:bg-white/5 border-b-2 border-indigo-600 dark:border-banana-400' : 'text-gray-500 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300'}`}
        >
          <Palette className="w-4 h-4" />
          {labels.tabStyle}
        </button>
        <button
          onClick={() => setActiveTab('script')}
          className={`flex-1 py-3 px-2 text-xs md:text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'script' ? 'text-indigo-600 dark:text-banana-400 bg-white dark:bg-white/5 border-b-2 border-indigo-600 dark:border-banana-400' : 'text-gray-500 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300'}`}
        >
          <FileText className="w-4 h-4" />
          {labels.tabScript}
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`flex-1 py-3 px-2 text-xs md:text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative ${activeTab === 'assets' ? 'text-indigo-600 dark:text-banana-400 bg-white dark:bg-white/5 border-b-2 border-indigo-600 dark:border-banana-400' : 'text-gray-500 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300'}`}
        >
          <Database className="w-4 h-4" />
          {labels.tabAssets}
          {assets.length > 0 && (
            <span className="absolute top-2 right-4 w-2 h-2 bg-indigo-500 dark:bg-banana-500 rounded-full"></span>
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">

        {/* Style Tab */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'style' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <StylePanel
            styleState={styleState}
            onStyleChange={onStyleChange}
            labels={labels}
            language={language}
          />
        </div>

        {/* Script Tab Content */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'script' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <div className="bg-gray-50 dark:bg-white/5 p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500 dark:text-banana-400" />
              {labels.novelInput}
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".txt,.md"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-gray-400 hover:text-indigo-600 dark:hover:text-banana-400 transition-colors p-1"
                title={labels.uploadFile}
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setText(''); onLoadNovel('', ''); }}
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                title={labels.clearText}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-2 relative">
            {novelStatus.hasNovel ? (
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-banana-400/10 p-3 rounded-lg border border-indigo-100 dark:border-banana-400/20 shadow-sm z-10">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-indigo-600 dark:text-banana-500" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-none mb-1">{novelStatus.filename || labels.tabScript}</h3>
                    <p className="text-xs text-indigo-500 dark:text-banana-400 font-mono leading-none">{labels.novelLoaded}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{labels.progress || "进度"}</p>
                  <p className="text-sm font-bold text-indigo-600 dark:text-banana-400 font-mono leading-none">{novelStatus.progress}</p>
                </div>
              </div>
            ) : null}
            <textarea
              className="flex-1 w-full bg-white dark:bg-black/20 text-gray-800 dark:text-gray-200 p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-banana-500/50 border border-gray-200 dark:border-white/5 shadow-inner dark:shadow-none font-mono text-sm leading-relaxed"
              placeholder={labels.pastePlaceholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isProcessing || !!novelStatus.filename}
            />
          </div>
        </div>

        {/* Assets Tab Content */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'assets' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <AssetLibrary
            assets={assets}
            onUpdateAsset={onUpdateAsset}
            onAddAsset={onAddAsset}
            onDeleteAsset={onDeleteAsset}
            onExtract={handleExtractClick}
            isExtracting={status === AnalysisStatus.EXTRACTING}
            labels={labels}
            hasText={!!text.trim() || novelStatus.hasNovel}
            currentStyle={styleState}
            onImportFromGlobal={onImportFromGlobal}
            language={language}
          />
        </div>

      </div>

      {/* Main Action Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 z-20 flex flex-col gap-3">

        {/* Generation Settings */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
          <span className="font-medium">目标集数:</span>
          <div className="flex items-center gap-2 bg-white dark:bg-black/20 rounded-lg p-1 border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
            <select
              value={episodeMode}
              onChange={handleModeChange}
              className="bg-transparent text-indigo-600 dark:text-banana-400 font-bold focus:outline-none appearance-none cursor-pointer pl-2 pr-1 text-center"
              style={{ textAlignLast: 'center' }}
            >
              <option value="auto" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-300">{language === 'Chinese' ? "自动" : "Auto"}</option>
              <option value="10" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-300">10</option>
              <option value="20" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-300">20</option>
              <option value="30" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-300">30</option>
              <option value="custom" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-300">{language === 'Chinese' ? "自定义" : "Custom"}</option>
            </select>

            {episodeMode === 'custom' && (
              <input
                type="number"
                min="1"
                max="99"
                placeholder="Num"
                value={episodeCount}
                onChange={handleCustomInputChange}
                className="w-12 bg-gray-50 dark:bg-white/5 rounded border border-gray-200 dark:border-white/10 text-center text-gray-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500 dark:focus:border-banana-500 text-xs py-0.5"
              />
            )}

            <span className="text-[10px] text-gray-400 dark:text-gray-500 pr-2">
              {episodeMode === 'auto' ? '' : (language === 'Chinese' ? '集' : 'Eps')}
            </span>
          </div>
        </div>

        <button
          onClick={handleAnalyzeClick}
          disabled={isProcessing || (!text.trim() && !novelStatus.hasNovel)}
          className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${isProcessing || (!text.trim() && !novelStatus.hasNovel)
            ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : novelStatus.hasNovel 
              ? 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'bg-indigo-600 dark:bg-banana-400 hover:bg-indigo-700 dark:hover:bg-banana-500 text-white dark:text-dark-900 shadow-lg shadow-indigo-500/20 dark:shadow-banana-500/20'
            }`}
        >
          {status === AnalysisStatus.ANALYZING ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 dark:border-dark-900/30 border-t-white dark:border-t-dark-900 rounded-full animate-spin" />
              {progressMessage || labels.analyzing}
            </>
          ) : (
            <>
              {novelStatus.hasNovel ? <RefreshCw className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
              {novelStatus.hasNovel ? (labels.regenerate || "重新生成") : labels.generate}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default InputPanel;