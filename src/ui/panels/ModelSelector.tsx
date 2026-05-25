import React, { useState } from 'react';
import { Settings, ChevronDown, PlayCircle, X, Box, Type, Image, Video, Sparkles, Maximize, Upload } from 'lucide-react';
import { modelManager, ModelConfig, ProviderType } from '@/services/ai/model-manager';

export const ModelSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModelConfig>(modelManager.getConfig());

  const handleOpenToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleUpdateString = (key: keyof ModelConfig, value: string) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    modelManager.setConfig(newConfig);
  };

  const handleUpdate = (key: keyof ModelConfig, value: ProviderType) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    modelManager.setConfig(newConfig);
  };

  const options: ProviderType[] = ['t8star', 'polo'];

  return (
    <div className="relative z-50">
      <button
        onClick={handleOpenToggle}
        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        title="Model Settings"
      >
        <Settings size={20} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-[360px] max-h-[85vh] flex flex-col bg-white dark:bg-[#12141A] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="p-5 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>



              {/* Cards Container */}
              <div className="space-y-3">

                {/* Text Model Card */}
                <div className="bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-white/5 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-2 rounded-lg text-indigo-600 dark:text-slate-300">
                      <Type size={16} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">Text Model</div>
                      <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">选择用于文本生成的模型</div>
                    </div>
                  </div>
                  <div className="relative w-[110px]">
                    <select
                      value={config.textmodel}
                      onChange={(e) => handleUpdate('textmodel', e.target.value as ProviderType)}
                      className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                    >
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                  </div>
                </div>

                {/* Image Model Main Wrapper */}
                <div className="bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-white/5 rounded-xl flex flex-col overflow-hidden">
                  {/* Image Model Base Card */}
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-2 rounded-lg text-indigo-600 dark:text-slate-300">
                        <Image size={16} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">Image Model</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">选择用于图像生成的模型</div>
                      </div>
                    </div>
                    <div className="relative w-[110px]">
                      <select
                        value={config.imagemodel}
                        onChange={(e) => handleUpdate('imagemodel', e.target.value as ProviderType)}
                        className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                      >
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* T8Star Config Expansion */}
                  {config.imagemodel === 't8star' && (
                    <div className="border-t border-gray-200 dark:border-white/5 p-4 pt-4">

                      {/* Left border wrapper to match the image */}
                      <div className="border-l-[3px] border-indigo-500 dark:border-[#4D58B8] pl-4 flex flex-col space-y-5">

                        {/* T8star Model Select */}
                        <div>
                          <div className="flex items-center space-x-2 text-indigo-600 dark:text-[#7B8BFF] mb-3">
                            <Sparkles size={14} />
                            <span className="text-[13px] font-semibold">T8star Image Model</span>
                          </div>
                          <div className="relative">
                            <select
                              value={config.t8starImageModel || 'nano-banana-pro'}
                              onChange={(e) => handleUpdateString('t8starImageModel', e.target.value)}
                              className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                            >
                              <option value="nano-banana-pro">nano-banana-pro</option>
                              <option value="gpt-image-2">gpt-image-2</option>
                              <option value="gpt-image-2-official">gpt-image-2 (官方版)</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                          </div>
                        </div>

                        {/* T8star Optional Official Size & Quality Settings */}
                        {(config.t8starImageModel === 'gpt-image-2-official' || config.t8starImageModel === 'gpt-image-2') && (
                          <>
                            {/* Size Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-1.5 rounded-md text-indigo-600 dark:text-slate-300">
                                  <Maximize size={15} />
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">高级尺寸 (Size)</div>
                                  <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">设置图像输出的尺寸</div>
                                </div>
                              </div>

                              {(() => {
                                const sizeMap: Record<string, Record<string, string>> = {
                                  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' },
                                  '3:2': { '1K': '1200x800', '2K': '1536x1024', '4K': '3072x2048' },
                                  '2:3': { '1K': '800x1200', '2K': '1024x1536', '4K': '2048x3072' },
                                  '4:3': { '1K': '1152x864', '2K': '1408x1056', '4K': '2880x2160' },
                                  '3:4': { '1K': '864x1152', '2K': '1056x1408', '4K': '2160x2880' },
                                  '5:4': { '1K': '1280x1024', '2K': '1600x1280', '4K': '3200x2560' },
                                  '4:5': { '1K': '1024x1280', '2K': '1280x1600', '4K': '2560x3200' },
                                  '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
                                  '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
                                  '2:1': { '1K': '1280x640', '2K': '2048x1024', '4K': '4096x2048' },
                                  '1:2': { '1K': '640x1280', '2K': '1024x2048', '4K': '2048x4096' },
                                  '21:9': { '1K': '1680x720', '2K': '2464x1056', '4K': '3360x1440' },
                                  '9:21': { '1K': '720x1680', '2K': '1056x2464', '4K': '1440x3360' },
                                };

                                const val = config.t8starImageSize || 'auto';
                                let ratio = '1:1';
                                let res = '2K';

                                if (val !== 'auto') {
                                  let found = false;
                                  for (const r in sizeMap) {
                                    for (const s in sizeMap[r]) {
                                      if (sizeMap[r][s] === val) {
                                        ratio = r;
                                        res = s;
                                        found = true;
                                        break;
                                      }
                                    }
                                    if (found) break;
                                  }
                                }

                                const handleRatioResChange = (newRatio: string, newRes: string) => {
                                  handleUpdateString('t8starImageSize', sizeMap[newRatio][newRes]);
                                };

                                return (
                                  <>
                                    <div className="flex items-center space-x-3 mb-3">
                                      <div className="flex-1">
                                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-500 mb-1 uppercase tracking-wider">Ratio</div>
                                        <div className="relative">
                                          <select
                                            value={ratio}
                                            onChange={(e) => handleRatioResChange(e.target.value, res)}
                                            className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                          >
                                            <option value="1:1">1:1</option>
                                            <option value="3:2">3:2</option>
                                            <option value="2:3">2:3</option>
                                            <option value="4:3">4:3</option>
                                            <option value="3:4">3:4</option>
                                            <option value="5:4">5:4</option>
                                            <option value="4:5">4:5</option>
                                            <option value="16:9">16:9</option>
                                            <option value="9:16">9:16</option>
                                            <option value="2:1">2:1</option>
                                            <option value="1:2">1:2</option>
                                            <option value="21:9">21:9</option>
                                            <option value="9:21">9:21</option>
                                          </select>
                                          <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-500 mb-1 uppercase tracking-wider">Res</div>
                                        <div className="relative">
                                          <select
                                            value={res}
                                            onChange={(e) => handleRatioResChange(ratio, e.target.value)}
                                            className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                          >
                                            <option value="1K">1K</option>
                                            <option value="2K">2K</option>
                                            <option value="4K">4K（暂不可用）</option>
                                          </select>
                                          <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                                        </div>
                                      </div>
                                    </div>

                                  </>
                                );
                              })()}
                            </div>

                            {/* Quality Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-1.5 rounded-md text-indigo-600 dark:text-slate-300 font-bold text-[9px] w-[26px] h-[26px] flex items-center justify-center">
                                  HD
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">图像质量 (Quality)</div>
                                  <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">选择图像生成质量</div>
                                </div>
                              </div>

                              <div className="relative">
                                <select
                                  value={config.t8starImageQuality || 'auto'}
                                  onChange={(e) => handleUpdateString('t8starImageQuality', e.target.value)}
                                  className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="auto">Auto (默认)</option>
                                  <option value="low">Low (低 - 最快)</option>
                                  <option value="medium">Medium (中)</option>
                                  <option value="high">High (高)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>

                          </>
                        )}

                        {/* Nano/Gemini Settings */}
                        {(config.t8starImageModel === 'nano-banana-pro') && (
                          <>
                            {/* Nano Size Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-1.5 rounded-md text-indigo-600 dark:text-slate-300">
                                  <Maximize size={15} />
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">基础尺寸 (Size)</div>
                                  <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">设置图像输出的基础分辨率</div>
                                </div>
                              </div>
                              <div className="relative mb-3">
                                <select
                                  value={config.t8starNanoImageSize || '2K'}
                                  onChange={(e) => handleUpdateString('t8starNanoImageSize', e.target.value)}
                                  className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="1K">1K</option>
                                  <option value="2K">2K</option>
                                  <option value="4K">4K(暂不可用)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>

                            {/* Nano Aspect Ratio Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-1.5 rounded-md text-indigo-600 dark:text-slate-300 font-bold text-[9px] w-[26px] h-[26px] flex items-center justify-center">
                                  AR
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">生成比例 (Aspect Ratio)</div>
                                  <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">设置图像画幅比例</div>
                                </div>
                              </div>
                              <div className="relative">
                                <select
                                  value={config.t8starNanoAspectRatio || '16:9'}
                                  onChange={(e) => handleUpdateString('t8starNanoAspectRatio', e.target.value)}
                                  className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="16:9">16:9</option>
                                  <option value="9:16">9:16</option>
                                  <option value="1:1">1:1</option>
                                  <option value="4:3">4:3</option>
                                  <option value="3:4">3:4</option>
                                  <option value="3:2">3:2</option>
                                  <option value="2:3">2:3</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                    </div>
                  )}
                </div>

                {/* Video Model Main Wrapper */}
                <div className="bg-gray-50 dark:bg-[#1A1D24] border border-gray-200 dark:border-white/5 rounded-xl flex flex-col overflow-hidden">
                  {/* Video Model Base Card */}
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-white dark:bg-[#242832] border border-gray-200 dark:border-none p-2 rounded-lg text-indigo-600 dark:text-slate-300">
                        <Video size={16} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-0.5">Video Model</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-500 leading-tight">选择用于视频生成的模型提供商</div>
                      </div>
                    </div>
                    <div className="relative w-[110px]">
                      <select
                        value={config.videomodel}
                        onChange={(e) => handleUpdate('videomodel', e.target.value as ProviderType)}
                        className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                      >
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* T8Star Video Config Expansion */}
                  {config.videomodel === 't8star' && (
                    <div className="border-t border-gray-200 dark:border-white/5 p-4 pt-4">
                      {/* Left border wrapper */}
                      <div className="border-l-[3px] border-indigo-500 dark:border-[#4D58B8] pl-4 flex flex-col space-y-5">

                        {/* T8star Video Model Select */}
                        <div>
                          <div className="flex items-center space-x-2 text-indigo-600 dark:text-[#7B8BFF] mb-3">
                            <PlayCircle size={14} />
                            <span className="text-[13px] font-semibold">T8star Video Engine</span>
                          </div>
                          <div className="relative">
                            <select
                              value={config.t8starVideoModel || 'veo'}
                              onChange={(e) => handleUpdateString('t8starVideoModel', e.target.value)}
                              className="w-full bg-white dark:bg-[#0D0F12] text-gray-800 dark:text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-gray-300 dark:border-white/5 focus:border-indigo-500 dark:focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                            >
                              <option value="veo">veo 3.1</option>
                              <option value="doubao-seedance-2-0-260128">seedance 2.0</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>


              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;

