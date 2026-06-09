import React, { useState } from 'react';
import { clearState } from '@/services/storage';
import InputPanel from '@/ui/panels/InputPanel';
import ChunkPanel from '@/ui/cards/chunk/ChunkPanel';
import { AssetSelector } from '@/ui/panels/asset-library/AssetSelector';
import { Film, Globe, Book, Trash2, Upload, Sun, Moon, Info, Settings, X, Check } from 'lucide-react';
import { STATE_KEY } from '@/shared/constants/defaults';
import { useAppState } from './useAppState';
import { SettingsPanel } from '@/ui/panels/SettingsPanel';
import { useModelConfig, modelManager } from '@/services/ai/model-manager';

const App: React.FC = () => {
    const {
        chunks, globalAssets, globalStyle, setGlobalStyle,
        language, setLanguage, status, analysisProgress,
        expandedId, setExpandedId, activeChunkId, setActiveChunkId,
        showGlobalSelector, setShowGlobalSelector,
        filename, t, targetChunkId, targetChunk, displayedAssets,
        updateChunk, handleLoadNovel, handleAnalyze,
        handleChunkExtract, handleChunkScript, handleGenerateBeats, handleGeneratePrompts, handleImportChunk,
        handleManualExtractAssets,
        flashScene, handleSceneUpdate, handleDuplicateScene,
        handleGenerateImageWrapper, handleUpdateAsset, handleAddAsset, handleDeleteAsset,
        handleDeleteChunk,
        handleCopyChunk,
        theme, toggleTheme,
        fullNovelText,
        toast,
    } = useAppState();

    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const modelConfig = useModelConfig();


    return (
        <div className="min-h-screen bg-[#f7f5f0] dark:bg-dark-900 text-slate-900 dark:text-gray-100 flex flex-col font-sans selection:bg-indigo-500/30 dark:selection:bg-banana-500/30 transition-colors duration-300">

            {/* Header */}
            <header className="bg-white/80 dark:bg-dark-800/80 border-b border-gray-200 dark:border-white/5 sticky top-0 z-50 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-banana-400 dark:to-banana-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 dark:shadow-banana-500/20">
                            <Film className="w-5 h-5 text-white dark:text-dark-900" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:to-gray-400 hidden sm:block">
                            {t.appTitle} <span className="font-light text-indigo-600 dark:text-banana-400">Pro</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-3 text-xs md:text-sm">


                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-banana-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5"
                            title={t.tabSettings || (language === 'Chinese' ? "系统设置" : "System Settings")}
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        <button
                            onClick={toggleTheme}
                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-banana-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5"
                            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>

                        <button
                            onClick={async () => {
                                if (confirm(language === 'Chinese' ? "确定要清除所有缓存并重置吗？这将丢失当前所有进度。" : "Are you sure you want to clear cache? All progress will be lost.")) {
                                    await clearState(STATE_KEY);
                                    window.location.reload();
                                }
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-white/5"
                            title={language === 'Chinese' ? "清除缓存并重置" : "Clear Cache & Reset"}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-black/20 px-3 py-1.5 rounded-full border border-gray-200 dark:border-white/5 hover:border-indigo-300 dark:hover:border-banana-500/30 transition-colors">
                            <label className="cursor-pointer flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-banana-400 transition-colors" title={language === 'Chinese' ? "导入章节片段 (ZIP)" : "Import Chunk (ZIP)"}>
                                <Upload className="w-4 h-4" />
                                <input type="file" accept=".zip" className="hidden" onChange={handleImportChunk} />
                            </label>
                        </div>

                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-black/20 px-3 py-1.5 rounded-full border border-gray-200 dark:border-white/5 hover:border-indigo-300 dark:hover:border-banana-500/30 transition-colors">
                            <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-banana-400" />
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="bg-transparent border-none focus:outline-none text-gray-600 dark:text-gray-300 font-medium cursor-pointer appearance-none pr-1 text-center"
                                style={{ textAlignLast: 'center' }}
                            >
                                <option value="Chinese" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">中文</option>
                                <option value="English" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">English</option>
                                <option value="Japanese" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">日本語</option>
                                <option value="Korean" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">한국어</option>
                                <option value="Spanish" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">Español</option>
                                <option value="French" className="bg-white dark:bg-dark-800 text-gray-900 dark:text-white">Français</option>
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* Left: Settings Panel */}
                <div className="lg:col-span-3 lg:sticky lg:top-24 flex flex-col gap-4 h-[calc(100vh-8rem)]">
                    <InputPanel
                        onAnalyze={handleAnalyze}
                        onLoadNovel={handleLoadNovel}
                        novelStatus={{
                            hasNovel: chunks.length > 0,
                            filename: filename,
                            progress: `${chunks.filter(c => c.status === 'completed').length} / ${chunks.length}`
                        }}
                        initialText={fullNovelText}
                        status={status}
                        labels={t}
                        assets={displayedAssets}
                        onUpdateAsset={handleUpdateAsset}
                        onAddAsset={handleAddAsset}
                        onDeleteAsset={handleDeleteAsset}
                        onExtractAssets={handleManualExtractAssets}
                        styleState={globalStyle}
                        onStyleChange={setGlobalStyle}
                        language={language}
                        onImportFromGlobal={targetChunkId ? () => setShowGlobalSelector(true) : undefined}
                        progressMessage={analysisProgress}
                    />
                </div>

                {/* Right: Chunk Workflow Stream */}
                <div className="lg:col-span-9 flex flex-col gap-4 pb-20 relative">

                    {chunks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] opacity-50 dark:opacity-30 text-center p-8 border-2 border-dashed border-gray-300 dark:border-white/10 rounded-xl text-gray-500 dark:text-gray-100">
                            <Book className="w-16 h-16 mb-4" />
                            <h3 className="text-xl font-bold">{t.readyTitle}</h3>
                            <p className="max-w-md">{t.readyDesc}</p>
                        </div>
                    )}

                    {chunks.map((chunk) => (
                        <ChunkPanel
                            key={chunk.id}
                            chunk={chunk}
                            allChunks={chunks}
                            globalAssets={globalAssets}
                            styleState={globalStyle}
                            labels={t}
                            onUpdateChunk={updateChunk}
                            onDeleteChunk={handleDeleteChunk}
                            onCopyChunk={handleCopyChunk}
                            onSceneUpdate={handleSceneUpdate}
                            onDuplicateScene={handleDuplicateScene}
                            onExtract={handleChunkExtract}
                            onGenerateScript={handleChunkScript}
                            onGenerateBeats={handleGenerateBeats}
                            onGeneratePrompts={handleGeneratePrompts}
                            onGenerateImage={handleGenerateImageWrapper}
                            onAddAsset={handleAddAsset}
                            language={language}
                            isActive={expandedId === chunk.id}
                            flashSceneId={flashScene?.chunkId === chunk.id ? flashScene.sceneId : undefined}
                            fullNovelText={fullNovelText}
                            filename={filename}
                            onToggle={() => {
                                setExpandedId(expandedId === chunk.id ? null : chunk.id);
                                setActiveChunkId(activeChunkId === chunk.id ? null : chunk.id);
                            }}
                        />
                    ))}

                </div>
            </main>

            {showGlobalSelector && (
                <AssetSelector
                    assets={globalAssets}
                    onClose={() => setShowGlobalSelector(false)}
                    onSelect={() => { }}
                    allowMultiple={true}
                    selectedIds={targetChunk?.assets.map(a => a.id) || []}
                    onConfirm={(selectedIds) => {
                        if (targetChunkId && targetChunk) {
                            const newAssets = globalAssets.filter(a => selectedIds.includes(a.id));
                            const existingIds = new Set(targetChunk.assets.map(a => a.id));
                            const uniqueNew = newAssets.filter(a => !existingIds.has(a.id));
                            if (uniqueNew.length > 0) {
                                updateChunk(targetChunkId, { assets: [...targetChunk.assets, ...uniqueNew] });
                            }
                        }
                        setShowGlobalSelector(false);
                    }}
                />
            )}
            {showSettingsModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
                    <div className="relative w-full max-w-4xl bg-white dark:bg-[#111113] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#17171a]">
                            <div className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-indigo-600 dark:text-banana-400" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white tracking-wide">
                                    {t.tabSettings || (language === 'Chinese' ? "系统设置" : "System Settings")}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setShowSettingsModal(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-2 bg-white dark:bg-dark-800">
                            <SettingsPanel
                                providers={modelConfig.providers}
                                onUpdateProviders={(updatedProviders) => modelManager.setConfig({ providers: updatedProviders })}
                                activeTextModel={modelConfig.textmodel}
                                activeImageModel={modelConfig.imagemodel}
                                activeVideoModel={modelConfig.videomodel}
                                onChangeActiveModel={(type, val) => {
                                    if (type === 'text') {
                                        const provider = modelConfig.providers.find(p => p.id === val);
                                        const firstModel = provider?.chatModels?.[0] || 'gpt-5.4-mini-2026-03-17';
                                        modelManager.setConfig({
                                            textmodel: val,
                                            t8starTextModel: firstModel
                                        });
                                    }
                                    if (type === 'image') modelManager.setConfig({ imagemodel: val });
                                    if (type === 'video') modelManager.setConfig({ videomodel: val });
                                }}
                                language={language}
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#17171a]">
                            <button
                                onClick={() => setShowSettingsModal(false)}
                                className="px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 dark:bg-banana-400 text-white dark:text-black flex items-center gap-1.5 shadow-md shadow-indigo-600/20 dark:shadow-banana-400/20 hover:opacity-90 active:scale-95 transition-all"
                            >
                                <Check className="w-4 h-4 stroke-[3]" />
                                {language === 'Chinese' ? "保存并确定" : "Save & Close"}
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 bg-white/95 dark:bg-dark-800/95 border border-indigo-500/30 dark:border-banana-400/30 shadow-xl shadow-indigo-500/10 dark:shadow-banana-500/10 backdrop-blur-md px-4 py-3 rounded-xl max-w-sm animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-banana-400/10 flex items-center justify-center shrink-0">
                        <Info className="w-4 h-4 text-indigo-600 dark:text-banana-400" />
                    </div>
                    <div className="text-xs md:text-sm font-medium text-gray-700 dark:text-gray-200">
                        {toast.message}
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
