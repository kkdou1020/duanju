

export type Translation = {
  appTitle: string;
  charConsistency: string;
  charPlaceholder: string;
  novelInput: string;
  clearText: string;
  pastePlaceholder: string;
  analyzing: string;
  extracting: string;
  generate: string;
  readyTitle: string;
  readyDesc: string;
  scene: string;
  visualDesc: string; // Now "Video Prompt" in UI
  prompt: string; // Now "Image Prompt"
  visualize: string;
  rendering: string;
  endSequence: string;
  errorNoPlot: string;
  errorGeneric: string;
  copy: string;
  visualizeBtn: string;
  openFull: string;
  // Asset Library
  tabScript: string;
  tabAssets: string;
  assetsTitle: string;
  extractAssets: string;
  addAsset: string;
  noAssets: string;
  assetNamePlaceholder: string;
  assetDescPlaceholder: string;
  autoExtractTip: string;
  uploadFile: string;
  genRefImage: string;
  refImageTip: string;
  genMissing: string;
  // Novel Mode & Batch
  loadNovel: string;
  novelLoaded: string;
  progress: string;
  continueNovel: string;
  shootAll: string;
  editHint: string;
  // Style
  tabStyle: string;
  styleTitle: string;
  directorStyle: string;
  workStyle: string;
  textureStyle: string;
  strength: string;
  seed: string;
  randomize: string;
  none: string;
  directorHint: string;
  workHint: string;
  textureHint: string;
  customPlaceholder: string;
  aspectRatio: string;
  arHint: string;
  voiceStyle: string;
  voiceHint: string;
  previewVoice: string;
  // Chunk & Workflow
  chunkLabel: string;
  btnExtract: string;
  btnScript: string;
  btnStoryboard: string;
  btnGeneratePrompts: string;
  btnShoot: string;
  btnDownload: string;
  btnDelete: string;
  confirmDeleteChunk: string;
  btnFilm: string;
  statusIdle: string;
  statusReady: string;
  regenerate: string;
  saveImage: string;
  // New Video/Dialogue fields
  videoPromptLabel: string;
  imagePromptLabel: string;
  lensLabel: string;
  cameraLabel: string;
  durationLabel: string;
  vfxLabel: string;
  dialogueBtn: string;
  dialogueLabel: string;
  sfxLabel: string;
  genVideo: string;
  videoGenerating: string;
  allChaptersDone: string;
};

export const translations: Record<string, Translation> = {
  Chinese: {
    appTitle: "NanoBanana",
    charConsistency: "角色一致性:",
    charPlaceholder: "{{CHAR_MAIN}} 的外貌描述...",
    novelInput: "故事脚本",
    clearText: "清空文本",
    pastePlaceholder: "在此粘贴您的小说片段...",
    analyzing: "正在导演分镜...",
    extracting: "提取设定中...",
    generate: "生成分镜脚本",
    readyTitle: "准备开拍",
    readyDesc: "在左侧粘贴小说片段，提取角色设定（DNA），然后生成带有 NanoBanana 视觉效果的专业分镜脚本。",
    scene: "场景",
    visualDesc: "视频画面描述",
    prompt: "分镜图片提示词",
    visualize: "生成画面",
    rendering: "渲染中...",
    endSequence: "—— 本次生成结束 ——",
    errorNoPlot: "AI 未在提供的文本中发现实质性情节。",
    errorGeneric: "操作失败。请检查 API Key 或重试。",
    copy: "复制",
    visualizeBtn: "生成图片",
    openFull: "查看大图",
    tabScript: "剧本大纲",
    tabAssets: "资产设定 (DNA)",
    assetsTitle: "数字资产库",
    extractAssets: "智能提取设定",
    addAsset: "添加资产",
    noAssets: "暂无资产。请点击“智能提取”或手动添加。",
    assetNamePlaceholder: "名称 (如: 李明)",
    assetDescPlaceholder: "视觉描述 (如: 银发, 红眼...)",
    autoExtractTip: "AI 将自动分析剧本中的角色与场景",
    uploadFile: "上传小说 (.txt, .md)",
    genRefImage: "生成设定图",
    refImageTip: "生成人物三视图或场景全景图作为一致性锚点",
    genMissing: "批量生成图片 (仅缺失)",
    // Novel Mode & Batch
    loadNovel: "加载长篇小说",
    novelLoaded: "小说已加载",
    progress: "进度",
    continueNovel: "继续生成下一章",
    shootAll: "一键拍摄",
    editHint: "提示：点击文本可直接修改脚本与提示词，修改后点击“一键拍摄”生效。",
    // Style Translations
    tabStyle: "作品风格",
    styleTitle: "风格约束系统",
    directorStyle: "参考导演 (叙事/节奏)",
    workStyle: "参考作品 (美术/光影)",
    textureStyle: "画面质感 (渲染风格)",
    strength: "参考程度",
    seed: "Seed",
    randomize: "掷骰子",
    none: "无 (默认)",
    directorHint: "影响分镜叙事手法、台词风格、悬念设置",
    workHint: "影响镜头语言、布景、色调、服化道",
    textureHint: "影响最终渲染材质 (3D, 2D, 水墨等)",
    customPlaceholder: "自定义...",
    aspectRatio: "影片画幅",
    arHint: "影响分镜生成比例 (16:9 或 9:16)",
    voiceStyle: "旁白音色",
    voiceHint: "全局旁白配音ID，将应用于所有场景",
    previewVoice: "试听",
    // Chunk & Workflow
    chunkLabel: "章节片段",
    btnExtract: "生成资产设定",
    btnScript: "生成分镜脚本",
    btnStoryboard: "生成分镜",
    btnGeneratePrompts: "生成提示词",
    btnShoot: "一键拍摄",
    btnDownload: "下载资产包 (ZIP)",
    btnDelete: "删除章节",
    confirmDeleteChunk: "确定要删除这个章节片段吗？此操作不可撤销。",
    btnFilm: "一键成片",
    statusIdle: "待处理",
    statusReady: "准备就绪",
    regenerate: "重新生成",
    saveImage: "保存原图",
    // New
    videoPromptLabel: "视频分镜提示词",
    imagePromptLabel: "分镜图片提示词",
    lensLabel: "焦段",
    cameraLabel: "运镜",
    durationLabel: "时长",
    vfxLabel: "特效",
    dialogueBtn: "旁白生成",
    dialogueLabel: "对白",
    sfxLabel: "音效/BGM",
    genVideo: "生成视频",
    videoGenerating: "视频生成中...",
    allChaptersDone: "所有章节已完成！"
  },
  English: {
    appTitle: "NanoBanana",
    charConsistency: "Char Consistency:",
    charPlaceholder: "{{CHAR_MAIN}} visual description...",
    novelInput: "Story Script",
    clearText: "Clear text",
    pastePlaceholder: "Paste your novel segment here...",
    analyzing: "Directing Storyboard...",
    extracting: "Extracting DNA...",
    generate: "Generate Storyboard",
    readyTitle: "Ready to Direct",
    readyDesc: "Paste a novel segment, extract character DNA assets, and generate a professional storyboard script with NanoBanana visuals.",
    scene: "SCENE",
    visualDesc: "Video Description",
    prompt: "Image Prompt",
    visualize: "Visualize",
    rendering: "RENDERING...",
    endSequence: "End of Scene Sequence",
    errorNoPlot: "The AI found no substantial plot in the provided text.",
    errorGeneric: "Operation failed. Please check your API key or try again.",
    copy: "Copy",
    visualizeBtn: "Visualize",
    openFull: "Open Full Size",
    tabScript: "Script",
    tabAssets: "Assets (DNA)",
    assetsTitle: "Digital Asset Library",
    extractAssets: "AI Extract Assets",
    addAsset: "Add Asset",
    noAssets: "No assets yet. Use 'AI Extract' or add manually.",
    assetNamePlaceholder: "Name (e.g. Hero)",
    assetDescPlaceholder: "Visual Description (e.g. silver hair...)",
    autoExtractTip: "AI will analyze script for characters & locations",
    uploadFile: "Upload File (.txt, .md)",
    genRefImage: "Gen DNA Image",
    refImageTip: "Generate 3-view or wide-shot anchor images",
    genMissing: "Batch Gen Images (Missing Only)",
    // Novel Mode & Batch
    loadNovel: "Load Novel",
    novelLoaded: "Novel Loaded",
    progress: "Progress",
    continueNovel: "Continue Next Batch",
    shootAll: "Shoot All",
    editHint: "Tip: Click text to edit script/prompts before shooting.",
    // Style Translations
    tabStyle: "Style",
    styleTitle: "Style Constraints",
    directorStyle: "Ref Director (Narrative)",
    workStyle: "Ref Work (Art/Camera)",
    textureStyle: "Texture (Medium)",
    strength: "Strength",
    seed: "Seed",
    randomize: "Roll Dice",
    none: "None (Default)",
    directorHint: "Affects storytelling, pacing, dialogue style",
    workHint: "Affects camera angles, lighting, set design",
    textureHint: "Affects rendering material (3D, 2D, Ink, etc.)",
    customPlaceholder: "Custom...",
    aspectRatio: "Aspect Ratio",
    arHint: "Affects storyboard aspect ratio (16:9 or 9:16)",
    voiceStyle: "Narration Voice",
    voiceHint: "Global ID for narration TTS",
    previewVoice: "Preview",
    // Chunk & Workflow
    chunkLabel: "Chapter Chunk",
    btnExtract: "Generate Asset Settings",
    btnScript: "Generate Script",
    btnStoryboard: "Storyboard",
    btnGeneratePrompts: "Gen Prompts",
    btnShoot: "Shoot All",
    btnDownload: "Download ZIP",
    btnDelete: "Delete Chunk",
    confirmDeleteChunk: "Are you sure you want to delete this chunk? This cannot be undone.",
    btnFilm: "Make Film",
    statusIdle: "Idle",
    statusReady: "Ready",
    regenerate: "Regenerate",
    saveImage: "Save Image",
    // New
    videoPromptLabel: "Video Prompt",
    imagePromptLabel: "Storyboard Image Prompt",
    lensLabel: "Lens",
    cameraLabel: "Camera",
    durationLabel: "Duration",
    vfxLabel: "VFX",
    dialogueBtn: "Generate Narration",
    dialogueLabel: "Dialogue",
    sfxLabel: "SFX/BGM",
    genVideo: "Gen Video",
    videoGenerating: "Generating...",
    allChaptersDone: "All chapters completed!"
  }
};
