import React, { useState } from 'react';
import { ProviderConfig } from '@/shared/types';
import { modelManager, parseVideoModel } from '@/services/ai/model-manager';
import { Check, Trash2, Plus, Info, RefreshCw, AlertCircle, Download, Upload } from 'lucide-react';

interface SettingsPanelProps {
  providers: ProviderConfig[];
  onUpdateProviders: (providers: ProviderConfig[]) => void;
  activeTextModel: string;
  activeImageModel: string;
  activeVideoModel: string;
  onChangeActiveModel: (type: 'text' | 'image' | 'video', val: string) => void;
  language?: string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  providers,
  onUpdateProviders,
  activeTextModel,
  activeImageModel,
  activeVideoModel,
  onChangeActiveModel,
  language = "Chinese"
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id || 't8star');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const activeProvider = providers.find(p => p.id === selectedProviderId);
  const activeTextProviderId = modelManager.getConfig().textmodel;
  const activeTextProvider = providers.find(p => p.id === activeTextProviderId);
  const chatModels = activeTextProvider?.chatModels || [];

  const handleUpdateModelKey = (model: string, key: string) => {
    if (!activeProvider) return;
    const currentKeys = activeProvider.modelApiKeys || {};
    const newKeys = { ...currentKeys, [model]: key };
    if (!key.trim()) {
      delete newKeys[model];
    }
    handleUpdateField("modelApiKeys", newKeys);
  };

  const allModels = activeProvider ? Array.from(new Set([
    ...(activeProvider.chatModels || []),
    ...(activeProvider.imageModels || []),
    ...(activeProvider.videoModels || [])
  ].map(m => m.trim()).filter(Boolean))) : [];

  const handleUpdateField = (field: keyof ProviderConfig, value: any) => {
    if (!activeProvider) return;
    const updated = providers.map(p => {
      if (p.id === selectedProviderId) {
        return { ...p, [field]: value };
      }
      return p;
    });
    onUpdateProviders(updated);
  };

  const handleUpdateModelModes = (index: number, mode: 'start_end_frame' | 'auto', checked: boolean) => {
    if (!activeProvider) return;
    const parsedModels = activeProvider.videoModels.map(parseVideoModel);
    const updated = [...parsedModels];
    const currentModes = [...updated[index].modes];
    if (checked) {
      if (!currentModes.includes(mode)) currentModes.push(mode);
    } else {
      const idx = currentModes.indexOf(mode);
      if (idx > -1) currentModes.splice(idx, 1);
    }
    updated[index] = { ...updated[index], modes: currentModes };
    const serialized = updated.map(m => `${m.name}:${m.modes.join(',')}`);
    handleUpdateField("videoModels", serialized);
  };

  const handleUpdateModelName = (index: number, newName: string) => {
    if (!activeProvider) return;
    const parsedModels = activeProvider.videoModels.map(parseVideoModel);
    const updated = [...parsedModels];
    updated[index] = { ...updated[index], name: newName };
    const serialized = updated.map(m => `${m.name}:${m.modes.join(',')}`);
    handleUpdateField("videoModels", serialized);
  };

  const handleAddVideoModel = () => {
    if (!activeProvider) return;
    const serialized = [...activeProvider.videoModels, "new-model:start_end_frame"];
    handleUpdateField("videoModels", serialized);
  };

  const handleRemoveVideoModel = (index: number) => {
    if (!activeProvider) return;
    const serialized = activeProvider.videoModels.filter((_, idx) => idx !== index);
    handleUpdateField("videoModels", serialized);
  };

  const handleAddCustomProvider = () => {
    const id = `custom_${Date.now()}`;
    const newProvider: ProviderConfig = {
      id,
      name: "Custom Provider",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      enabled: true,
      showInNode: true,
      imageModels: ["gpt-image-2"],
      videoModels: ["veo3.1-components"],
      chatModels: ["gpt-5.4-mini-2026-03-17"]
    };
    onUpdateProviders([...providers, newProvider]);
    setSelectedProviderId(id);
  };

  const handleDeleteProvider = (id: string) => {
    if (confirm(language === "Chinese" ? "确定要删除该接口通道吗？" : "Are you sure you want to delete this provider?")) {
      const remaining = providers.filter(p => p.id !== id);
      onUpdateProviders(remaining);
      if (selectedProviderId === id && remaining.length > 0) {
        setSelectedProviderId(remaining[0].id);
      }
    }
  };

  const handleTestConnection = async () => {
    if (!activeProvider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/config/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: activeProvider.baseUrl,
          apiKey: activeProvider.apiKey
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: language === "Chinese" ? "连接成功！" : "Connection Succeeded!" });
      } else {
        setTestResult({ success: false, error: data.error || (language === "Chinese" ? "连接失败" : "Connection Failed") });
      }
    } catch (e: any) {
      setTestResult({ success: false, error: e?.message || (language === "Chinese" ? "请求失败" : "Request Failed") });
    } finally {
      setTesting(false);
    }
  };

  const handleExportSettings = () => {
    try {
      const config = modelManager.getConfig();
      const backupData = {
        type: 'nanobanana_settings_backup',
        version: 1,
        timestamp: Date.now(),
        config
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nanobanana_settings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Export settings failed", e);
      alert(language === "Chinese" ? `导出设置失败: ${e.message}` : `Failed to export settings: ${e.message}`);
    }
  };

  const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      const jsonStr = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      const data = JSON.parse(jsonStr);
      if (data.type !== 'nanobanana_settings_backup' || !data.config) {
        throw new Error(language === "Chinese" ? "无效的系统设置备份文件" : "Invalid settings backup file");
      }

      const confirmMsg = language === "Chinese"
        ? "导入设置将覆盖您当前的 API Key、服务商 URL 以及通道模型配置，确定要继续吗？"
        : "Importing settings will overwrite your current API keys, urls and active channels. Continue?";

      if (!window.confirm(confirmMsg)) return;

      // Update configuration in modelManager
      modelManager.setConfig(data.config);

      // Update local React state of providers so UI updates immediately
      if (data.config.providers) {
        onUpdateProviders(data.config.providers);
      }

      // Update active model states in parent
      if (data.config.textmodel) onChangeActiveModel('text', data.config.textmodel);
      if (data.config.imagemodel) onChangeActiveModel('image', data.config.imagemodel);
      if (data.config.videomodel) onChangeActiveModel('video', data.config.videomodel);

      alert(language === "Chinese" ? "系统设置导入成功！" : "Settings imported successfully!");
    } catch (err: any) {
      console.error("Import settings failed", err);
      alert(language === "Chinese" ? `导入设置失败: ${err.message}` : `Failed to import settings: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-800 border-x border-b border-gray-200 dark:border-white/10 rounded-b-xl overflow-hidden shadow-sm dark:shadow-xl p-4 space-y-4 overflow-y-auto">
      {/* Top Provider Selector Grid */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
            {language === "Chinese" ? "接口通道选择" : "Interface Channel Selector"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSettings}
              className="text-[10px] text-indigo-600 dark:text-banana-400 hover:underline flex items-center gap-0.5 font-bold"
              title={language === "Chinese" ? "导出系统设置备份 (JSON)" : "Export Settings Backup (JSON)"}
            >
              <Download className="w-3 h-3" />
              {language === "Chinese" ? "导出设置" : "Export Settings"}
            </button>
            <span className="text-gray-300 dark:text-white/10 text-[10px]">|</span>
            <label className="text-[10px] text-indigo-600 dark:text-banana-400 hover:underline flex items-center gap-0.5 font-bold cursor-pointer" title={language === "Chinese" ? "导入系统设置备份 (JSON)" : "Import Settings Backup (JSON)"}>
              <Upload className="w-3 h-3" />
              {language === "Chinese" ? "导入设置" : "Import Settings"}
              <input type="file" accept=".json" className="hidden" onChange={handleImportSettings} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedProviderId(p.id);
                setTestResult(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                selectedProviderId === p.id
                  ? 'bg-indigo-600 dark:bg-banana-500 text-white dark:text-black border-indigo-500 dark:border-banana-400 shadow-md shadow-indigo-500/20 dark:shadow-banana-500/20'
                  : 'bg-white dark:bg-black/20 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={handleAddCustomProvider}
            className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-white/10 hover:border-indigo-500 dark:hover:border-banana-400 hover:text-indigo-600 dark:hover:text-banana-400 text-gray-400 flex items-center gap-1 text-xs font-bold transition-all"
            title={language === "Chinese" ? "添加自定义提供商" : "Add Custom Provider"}
          >
            <Plus className="w-3.5 h-3.5" />
            {language === "Chinese" ? "新增" : "New"}
          </button>
        </div>
      </div>

      {activeProvider && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header Panel */}
          <div className="bg-gray-50 dark:bg-black/15 rounded-lg p-3 border border-gray-200 dark:border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-gray-900 dark:text-white uppercase">
                  {activeProvider.id}
                </span>
                <span className="text-[10px] bg-indigo-50 dark:bg-banana-500/10 text-indigo-600 dark:text-banana-400 px-1.5 py-0.5 rounded border border-indigo-200/20 dark:border-banana-500/10 font-bold uppercase">
                  OpenAI 兼容
                </span>
                {activeProvider.enabled && (
                  <span className="text-[10px] text-green-500 font-bold flex items-center gap-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    {language === "Chinese" ? "已启用" : "Enabled"}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none mt-1">
                接入兼容 OpenAI 格式的图像 / 视频 / LLM 服务
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-lg border border-gray-300 dark:border-white/15 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                {language === "Chinese" ? "测试连接" : "Test Connection"}
              </button>

              {activeProvider.id.startsWith("custom_") && (
                <button
                  onClick={() => handleDeleteProvider(activeProvider.id)}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-lg border border-red-500/20 transition-colors"
                  title={language === "Chinese" ? "删除通道" : "Delete Channel"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Test connection alert banner */}
          {testResult && (
            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top-1 duration-200 ${
              testResult.success 
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400' 
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}>
              {testResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{testResult.success ? testResult.message : testResult.error}</span>
            </div>
          )}

          {/* Settings checkboxes */}
          <div className="flex items-center gap-4 bg-gray-50 dark:bg-black/5 p-2 px-3 rounded-lg border border-gray-200 dark:border-white/5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeProvider.enabled}
                onChange={(e) => handleUpdateField("enabled", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-banana-500 focus:ring-indigo-500 dark:focus:ring-banana-500 accent-indigo-600 dark:accent-banana-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {language === "Chinese" ? "启用该服务商" : "Enable Provider"}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeProvider.showInNode}
                onChange={(e) => handleUpdateField("showInNode", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-banana-500 focus:ring-indigo-500 dark:focus:ring-banana-500 accent-indigo-600 dark:accent-banana-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                在节点中显示
              </span>
            </label>
          </div>

          {/* Section 1: Basic info */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all space-y-3">
            <h3 className="font-extrabold text-indigo-600 dark:text-banana-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-white/5 pb-1">
              1. 基础信息
            </h3>
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">显示名称</span>
                <input
                  type="text"
                  value={activeProvider.name}
                  onChange={(e) => handleUpdateField("name", e.target.value)}
                  className="w-full bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">Base URL</span>
                <input
                  type="text"
                  value={activeProvider.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(e) => handleUpdateField("baseUrl", e.target.value)}
                  className="w-full bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Connection key */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all space-y-3">
            <h3 className="font-extrabold text-indigo-600 dark:text-banana-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-white/5 pb-1">
              2. 连接密钥
            </h3>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 font-bold">{language === "Chinese" ? "默认 API Key / Token (全局/生文)" : "Default API Key / Token (Global/Text)"}</span>
              <input
                type="password"
                value={activeProvider.apiKey}
                placeholder="********"
                onChange={(e) => handleUpdateField("apiKey", e.target.value)}
                className="w-full bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500 font-mono"
              />
              <span className="text-[9px] text-gray-400 leading-relaxed mt-1">
                Base URL 填到 /v1 这一层，例如 https://api.example.com/v1 ；部分通道为分销或通用 Key。
              </span>
            </div>

            {/* Collapsible model-specific keys list */}
            {allModels.length > 0 && (
              <details className="group border border-gray-200 dark:border-white/5 rounded-lg overflow-hidden bg-white/50 dark:bg-black/20">
                <summary className="flex items-center justify-between p-2.5 px-3.5 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 select-none transition-colors">
                  <span>{language === "Chinese" ? "🔑 每个模型的专属 API Key (可选)" : "🔑 Per-Model API Key Mappings (Optional)"}</span>
                  <span className="text-[10px] text-gray-400 font-normal transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <div className="p-3 border-t border-gray-200 dark:border-white/5 space-y-3 max-h-60 overflow-y-auto">
                  <div className="text-[9px] text-gray-400 leading-relaxed mb-1">
                    {language === "Chinese" ? "如果某个模型未在此单独配置专属 Key，将默认使用上方的全局 API Key。" : "If left blank, the global API Key above will be used."}
                  </div>
                  {allModels.map(model => (
                    <div key={model} className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold font-mono">{model}</span>
                      <input
                        type="password"
                        value={activeProvider.modelApiKeys?.[model] || ""}
                        placeholder={language === "Chinese" ? "使用默认全局 Key" : "Using default global key"}
                        onChange={(e) => handleUpdateModelKey(model, e.target.value)}
                        className="w-full bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Section 3: Models registry */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-white/5 pb-1">
              <h3 className="font-extrabold text-indigo-600 dark:text-banana-400 text-xs uppercase tracking-wider">
                3. 节点里可选的模型
              </h3>
              <div className="group relative">
                <Info className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-black border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none shadow-xl leading-relaxed">
                  每行填一个模型标识名。填入的名称将决定各生成节点中下拉框可选择的选项列表。
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-400 font-bold">图像模型 (一行一个)</span>
                <textarea
                  value={activeProvider.imageModels.join('\n')}
                  onChange={(e) => handleUpdateField("imageModels", e.target.value.split('\n'))}
                  className="w-full h-36 bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500 font-mono resize-none leading-relaxed"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/5 pb-1">
                  <span className="text-[10px] text-gray-400 font-bold">视频模型 (模型:模式)</span>
                  <button onClick={handleAddVideoModel} className="text-[10px] text-indigo-600 dark:text-banana-400 flex items-center gap-0.5 font-bold">
                    <Plus className="w-3 h-3" /> 新增
                  </button>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {activeProvider.videoModels.map(parseVideoModel).map((model, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white dark:bg-black/40 p-1.5 rounded border border-gray-200 dark:border-white/10">
                      <input
                        type="text"
                        value={model.name}
                        onChange={(e) => handleUpdateModelName(idx, e.target.value)}
                        className="bg-transparent text-xs text-gray-800 dark:text-gray-100 outline-none w-1/2 font-mono"
                      />
                      <div className="flex items-center gap-2 w-5/12">
                        <label className="flex items-center gap-1 cursor-pointer select-none text-[9px]">
                          <input
                            type="checkbox"
                            checked={model.modes.includes('start_end_frame')}
                            onChange={(e) => handleUpdateModelModes(idx, 'start_end_frame', e.target.checked)}
                            className="w-3 h-3 rounded text-indigo-600 dark:text-banana-500 focus:ring-0 cursor-pointer"
                          />
                          首尾帧
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer select-none text-[9px]">
                          <input
                            type="checkbox"
                            checked={model.modes.includes('auto')}
                            onChange={(e) => handleUpdateModelModes(idx, 'auto', e.target.checked)}
                            className="w-3 h-3 rounded text-indigo-600 dark:text-banana-500 focus:ring-0 cursor-pointer"
                          />
                          参考图
                        </label>
                      </div>
                      <button onClick={() => handleRemoveVideoModel(idx)} className="text-red-500 hover:text-red-400 p-0.5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-400 font-bold">聊天模型 (一行一个)</span>
                <textarea
                  value={activeProvider.chatModels.join('\n')}
                  onChange={(e) => handleUpdateField("chatModels", e.target.value.split('\n'))}
                  className="w-full h-36 bg-white dark:bg-black/40 text-xs text-gray-800 dark:text-gray-100 p-2 rounded border border-gray-300 dark:border-white/10 outline-none focus:border-indigo-500 font-mono resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Active provider mapping settings */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-white/5 hover:border-indigo-500/20 dark:hover:border-banana-500/20 transition-all space-y-3">
            <h3 className="font-extrabold text-indigo-600 dark:text-banana-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-white/5 pb-1">
              当前活跃渠道设置
            </h3>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">生文渠道 (LLM)</span>
                <select
                  value={modelManager.getConfig().textmodel}
                  onChange={(e) => onChangeActiveModel('text', e.target.value)}
                  className="bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 p-2 rounded border border-gray-300 dark:border-white/10 outline-none cursor-pointer"
                >
                  {providers.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">聊天模型 (Model)</span>
                <select
                  value={modelManager.getConfig().t8starTextModel}
                  onChange={(e) => modelManager.setConfig({ t8starTextModel: e.target.value })}
                  disabled={chatModels.length === 0}
                  className="bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 p-2 rounded border border-gray-300 dark:border-white/10 outline-none cursor-pointer disabled:opacity-50"
                >
                  {chatModels.length > 0 ? (
                    chatModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  ) : (
                    <option value="">无可用模型</option>
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">生图渠道 (Image)</span>
                <select
                  value={modelManager.getConfig().imagemodel}
                  onChange={(e) => onChangeActiveModel('image', e.target.value)}
                  className="bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 p-2 rounded border border-gray-300 dark:border-white/10 outline-none cursor-pointer"
                >
                  {providers.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-bold">生视频渠道 (Video)</span>
                <select
                  value={modelManager.getConfig().videomodel}
                  onChange={(e) => onChangeActiveModel('video', e.target.value)}
                  className="bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 p-2 rounded border border-gray-300 dark:border-white/10 outline-none cursor-pointer"
                >
                  {providers.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
