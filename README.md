# 🍌 NanoBanana Storyboarder Pro

> AI 驱动的短剧自动化分镜生产工具 — 从长篇小说到完整分镜蓝图，一键打通叙事架构、视觉导演、资产生产三层智能体流水线。

## ✨ 核心功能

### 🎬 三智能体流水线 (Multi-Agent Pipeline)

| 层级 | 智能体 | 职责 | 输入 → 输出 |
|------|--------|------|-------------|
| L1 | **Agent 1 · 叙事架构师** | 小说外科手术式压缩、钩子工程、多巴胺曲线编排 | 原著文本 → `NarrativeBlueprint` (叙事蓝图 JSON) |
| L2 | **Agent 2 · 视觉导演** | 400+ 核心镜头组映射、视觉对位法、奇观工程 | 叙事蓝图 → `MasterBeatSheet` (大师分镜表 25-35 镜/集) |
| L3 | **Agent 3 · 资产制作人** | 镜头 ID → 英文 Prompt 翻译、风格注入、三模态输出 | 分镜表 → 视频 Prompt / 图像 Prompt / 音频规格 |

### 🎨 视觉资产系统 (Visual Asset System)

- **Visual DNA**: 一键选择预设风格（赛博朋克 / 废土 / 民国 / 东方玄幻…）或自定义 workStyle + textureStyle
- **资产提取 (Agent A2)**: AI 自动从剧情中识别角色、场景、道具，生成统一视觉标签
- **参考图分析**: 上传角色/场景参考图，AI 分析并写入 visualTags，保证全片一致性
- **资产库管理**: 全局资产池，支持增删改查、变体生成、跨场景复用

### 🎞️ 三模态多媒体生成

| 模态 | 能力 | 支持模型 |
|------|------|---------|
| 🖼️ **图像** | 定场图 / 关键帧 / 图生视频底图 | T8Star Image / Polo Image / NanoBanana Pro |
| 🎥 **视频** | 标准模式 / 首尾帧模式 (Veo 3.1 Pro 4K) 异步轮询 | T8Star Video / Polo Video / Seedance 2.0 |
| 🔊 **音频** | 旁白 TTS / SFX 音效描述 / BGM 规格 | T8Star Audio / Suno / Udio 规范 |

### 🧩 节点画布编辑器 (Scene Canvas)

基于 React Flow 的可视化画布：

- **节点类型**: AssetNode (资产) / ImagePromptNode (图像提示) / VideoPromptNode (视频提示) / ImageOutputNode (图像出图) / VideoOutputNode (视频出图) / SceneRefNode (场景引用) / FirstLastFrameNode (首尾帧) / CustomNoteNode (自定义注释)
- **操作**: 复制/粘贴 (CanvasClipboard)、撤销/重做 (CanvasHistory)、快捷键系统 (CanvasShortcuts)
- **模式**: 每个场景支持 A/B/C 三套 Prompt 方案，画布独立保存

### 💾 数据持久化与恢复

- **IndexedDB**: 全状态自动保存（chunks / scenes / assets / generated media blobs）
- **会话恢复**: 刷新页面 100% 还原进度，生成的图片/视频以 Blob 形式本地持久化
- **导入/导出**: Chunk 级别 ZIP 打包导入导出，跨项目迁移

### 🌐 国际化 (i18n)

内置 4 种语言：中文 · English · 日本語 · 한국어，一键切换无需重启。

---

## 🏗️ 技术栈

### 前端 (Frontend)

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | **React** | 19.x |
| 构建 | **Vite** | 6.x |
| 语言 | **TypeScript** | 5.8.x |
| 样式 | **Tailwind CSS** | 3.4.x |
| 画布 | **@xyflow/react** (React Flow) | 12.x |
| 图标 | **lucide-react** | 0.560.x |
| 虚拟列表 | **react-virtuoso** | 4.x |
| 打包导出 | **file-saver** + **jszip** | latest |
| 桌面 | **Electron** | 42.x + electron-builder 26.x |

### 后端 (Backend Server)

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | **Express** | 4.x |
| 语言 | **TypeScript** | 5.8.x |
| 运行时 | **tsx** (开发) / Node (生产) | latest |
| 代理 | **http-proxy-middleware** | 2.x |
| HTTPS 代理 | **https-proxy-agent** | 9.x |
| 图像处理 | **sharp** | 0.33.x |
| HTTP 客户端 | **undici** + **node-fetch** | latest |
| AI SDK | **@google/genai** | 1.x |

### AI Provider 支持

| Provider | 文本 | 图像 | 视频 | 音频 | 说明 |
|----------|------|------|------|------|------|
| **T8Star** | ✅ | ✅ | ✅ | ✅ | 默认主 Provider |
| **Tutujin (Polo)** | ✅ | ✅ | ✅ | - | 备选 Provider |
| **Google Gemini** | ✅ | - | - | - | 文本推理 / Agent 大脑 |
| **NanoBanana** | - | ✅ | - | - | 自有图像模型 |

### 测试体系

| 层级 | 框架 | 说明 |
|------|------|------|
| 前端单测 | **Vitest 4.x** | 路径别名 `@` → `src/` |
| 后端单测 | **Vitest 4.x** + **Supertest** | Express 路由集成测试 |
| E2E | **Playwright 1.58+** | 6 条完整用户流，Mock / 真实 API 双模式 |

---

## 📂 项目架构

```
duanju/
├── 📁 src/                          # 前端源码
│   ├── 📁 app/
│   │   ├── App.tsx                   # 根组件（Header + 三大面板布局）
│   │   ├── useAppState.ts            # 全局状态管理（Zustand-free, 自定义 Hook）
│   │   ├── assetUtils.ts             # 资产工具函数
│   │   └── chunkUtils.ts             # Chunk 导入/导出工具
│   │
│   ├── 📁 features/                  # 业务级 Hooks
│   │   ├── useAssetUrl.ts            # Blob URL 管理 + IndexedDB 存储
│   │   ├── useChunkManager.ts        # Chunk 增删改查 + 导入导出
│   │   ├── useSceneManager.ts        # 场景状态流转
│   │   └── useSessionRestore.ts      # 页面刷新会话恢复
│   │
│   ├── 📁 services/
│   │   ├── 📁 ai/
│   │   │   ├── index.ts              # API 调用统一入口
│   │   │   ├── model-manager.ts      # 模型选择器 + Provider 路由
│   │   │   ├── assetResolver.ts      # 资产解析 (字符匹配 @角色名)
│   │   │   ├── helpers.ts            # 通用 AI 工具
│   │   │   └── 📁 media/             # 前端侧音视频调用封装
│   │   ├── 📁 i18n/translations.ts   # 4 语言翻译表
│   │   ├── 📁 storage/index.ts       # IndexedDB 封装
│   │   └── api.ts                    # fetch 封装 + 错误处理
│   │
│   ├── 📁 shared/
│   │   ├── 📁 types/index.ts         # Scene / Asset / Style / 全局类型定义
│   │   ├── 📁 constants/defaults.ts  # 默认值 + STATE_KEY
│   │   ├── asset-tags.ts             # @图像/@视频 标签解析
│   │   └── audio-extractor.ts        # 旁白文本提取
│   │
│   └── 📁 ui/                        # UI 组件层
│       ├── 📁 panels/                # 三大主面板
│       │   ├── InputPanel.tsx        # 小说输入 + 风格设置
│       │   ├── SettingsPanel.tsx     # 系统设置 + 模型配置
│       │   ├── StylePanel.tsx        # Visual DNA + 资产库
│       │   └── 📁 asset-library/     # 资产选择器组件
│       │
│       ├── 📁 cards/
│       │   ├── 📁 chunk/             # Chunk 卡片（一集 = 一个 Chunk）
│       │   └── 📁 scene/             # Scene 卡片（一镜 = 一个 Scene）
│       │       ├── SceneCard.tsx
│       │       ├── SceneImagePane.tsx     # 图像生成 Tab
│       │       ├── SceneVideoPane.tsx     # 视频生成 Tab
│       │       ├── SceneDialoguePane.tsx  # 对话/旁白 Tab
│       │       ├── SceneMediaViewer.tsx   # 媒体查看器
│       │       ├── CameraSelectorModal.tsx # 镜头选择器
│       │       └── 📁 canvas/        # ★ React Flow 节点画布
│       │           ├── SceneCanvasModal.tsx
│       │           ├── CustomNodeFactory.ts
│       │           ├── 📁 nodes/     # 8 种节点类型
│       │           ├── 📁 hooks/     # 剪贴板/历史/快捷键/状态
│       │           └── 📁 utils/
│       │
│       ├── 📁 common/LazyMedia.tsx   # 懒加载媒体组件
│       └── 📁 components/            # 通用组件 (HighlightTextarea 等)
│
├── 📁 server/                        # 后端 API 服务
│   ├── 📁 src/
│   │   ├── index.ts                  # Express 入口 + 代理配置 + 速率限制
│   │   ├── 📁 routes/                # 四大业务路由
│   │   │   ├── pipeline.ts           # Agent 1/2/3 流水线
│   │   │   ├── media.ts              # 图像/视频/音频生成
│   │   │   ├── style.ts              # 资产提取 / Visual DNA / 参考图分析
│   │   │   └── config.ts             # 动态模型配置
│   │   │
│   │   ├── 📁 services/ai/           # ★ 核心 AI 业务逻辑
│   │   │   ├── model-manager.ts      # Provider 配置管理
│   │   │   ├── helpers.ts            # 重试 + 超时 + 校验
│   │   │   ├── 📁 agents/            # 三大 Agent 实现
│   │   │   │   ├── pipeline.ts       # 流水线编排 + 重试验证
│   │   │   │   ├── agent1-narrative.ts
│   │   │   │   ├── agent2-visual.ts
│   │   │   │   ├── agent3-asset.ts
│   │   │   │   ├── script-segmenter.ts
│   │   │   │   └── types.ts          # NarrativeBlueprint / MasterBeatSheet 类型
│   │   │   ├── 📁 providers/         # AI Provider 适配层
│   │   │   │   ├── index.ts
│   │   │   │   ├── interfaces.ts
│   │   │   │   ├── openai-compatible.ts
│   │   │   │   └── t8star-utils.ts
│   │   │   ├── 📁 media/             # 后端音视频生成逻辑
│   │   │   │   ├── image.ts / video.ts / audio.ts
│   │   │   │   └── validators.ts
│   │   │   └── 📁 style/index.ts     # 资产提取 + 视觉分析
│   │   │
│   │   ├── 📁 domain/generation/     # 领域层 - 提示词工程
│   │   │   ├── core-lenses.ts        # ★ 400+ 核心镜头组数据库
│   │   │   ├── prompt.ts             # System Prompt 构建
│   │   │   └── 📁 skills/            # Agent Skill Prompt 文档 (SKILL.md)
│   │   │
│   │   └── 📁 shared/                # 与前端共享的类型/常量
│   │       ├── types.ts
│   │       └── asset-tags.ts
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── 📁 tests/                         # 全层测试套件
│   ├── 📁 frontend/                  # Vitest 前端单测 (9 文件)
│   ├── 📁 server/                    # Vitest 后端单测 (12 文件)
│   └── 📁 e2e/                       # Playwright E2E (6 条用户流)
│       ├── fixtures/                 # Mock 响应 JSON + 样例小说
│       └── test-helpers.ts           # Mock/Real 双模拦截器
│
├── 📁 docs/                          # 设计文档
│   ├── agent.md                      # Agent 1/2/3 System Prompt 全文
│   ├── seedance2.md                  # Seedance 2.0 视频平台集成指南
│   ├── 核心镜头组.md                 # 400 镜头组详细说明
│   ├── 豆包.md                       # 豆包 / 字节模型集成笔记
│   └── images.pdf
│
├── 📁 .agents/skills/seedance/       # Seedance Skill 定义
├── 📁 public/icon.png                # 应用图标
├── index.html                        # Vite 入口
├── main.cjs                          # Electron 主进程
├── Dockerfile                        # 容器化部署
├── deploy.ps1                        # GCloud 部署脚本
├── playwright.config.ts              # Playwright 配置
├── vitest.config.ts                  # Vitest 前端配置
├── vite.config.ts                    # Vite 配置
├── tailwind.config.js                # Tailwind 主题 (banana/indigo 双色)
├── postcss.config.js
├── tsconfig.json
├── package.json
└── .env                              # 环境变量 (API Keys)
```

---

## 🚀 快速开始

### 环境要求

- **Node.js**: ≥ 20.0.0
- **npm**: ≥ 10.x
- **操作系统**: Windows 10+ / macOS 12+ / Linux (推荐 Ubuntu 22.04)
- **内存**: ≥ 8GB (AI 生成任务较耗内存)
- **网络**: 可访问 AI Provider API（如需代理配置 `HTTPS_PROXY`）

### 1. 克隆与安装

```bash
git clone https://github.com/qiuflower/duanju.git
cd duanju

# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..
```

### 2. 配置环境变量

### 3. 启动开发环境

需要 **两个终端** 分别启动后端和前端：

**终端 1 — 启动后端 API 代理服务器** (端口 3002)：
```bash
npm run server
```

**终端 2 — 启动前端 Vite 开发服务器** (端口 5173)：
```bash
npm run dev
```

启动成功后打开浏览器访问 **http://localhost:5173**

> 💡 后端启动后会在控制台打印全部可用 API 路由清单。

---

## ⚙️ 配置与设置

### 系统设置面板 (SettingsPanel)

运行时可在 UI 中点击右上角 ⚙️ 图标动态配置：

| 设置项 | 说明 |
|--------|------|
| **Provider 开关** | 每个 Provider 独立启用/禁用 |
| **模型选择** | 文本/图像/视频/音频 四模态分别指定模型 ID |
| **Base URL 覆盖** | 自定义 API 端点（兼容自建代理） |
| **API Key 覆盖** | 运行时临时 Key，不写入磁盘 |
| **画面比例** | `9:16` (竖屏短剧) / `16:9` (横屏) / `1:1` |
| **旁白语音** | 多种预设音色选择 |

### 风格设置 (StylePanel)

| 功能 | 说明 |
|------|------|
| **Visual DNA 预设** | 内置 20+ 风格一键应用 |
| **自定义风格** | workStyle (画风) + textureStyle (质感) 自由组合 |
| **导演风格强度** | 0-100 滑块控制 AI 风格注入权重 |
| **参考图上传** | 上传 1-10 张角色/场景参考图，AI 分析提取 visualTags |
| **资产提取** | AI 自动扫描 BeatSheet，识别角色/场景/道具 |

---

## 🔗 API 路由总览

所有 API 统一挂载在 `/api/*` 下，由后端 Express 服务器提供。

### 🧠 Pipeline 流水线路由 (`/api/pipeline/*`)

| Method | Endpoint | 说明 | 请求体 | 响应 |
|--------|----------|------|--------|------|
| POST | `/analyze` | **Agent 1** · 叙事分析 | `{ text, language, episodeCount, directorStyle, directorStrength }` | `NarrativeBlueprint` |
| POST | `/beat-sheet` | **Agent 2** · 生成分镜表 + 资产提取 | `{ episode, language, style, existingAssets }` | `{ beatSheet, assets[], scenes[] }` |
| POST | `/prompts` | **Agent 3** · 生成三模态 Prompt (非流式) | `{ beatSheet, style, assets, language }` | `{ scenes: Scene[] }` |
| POST | `/prompts-stream` | **Agent 3** · SSE 流式输出 | 同上 | `text/event-stream` |
| POST | `/episode-scenes` | 集数场景拆分辅助 | `{ episode, ... }` | `Scene[]` |

### 🎬 Media 多媒体路由 (`/api/media/*`)

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/asset-image` | 生成资产参考图 (角色/场景立绘) |
| POST | `/scene-image` | 生成场景关键帧图 |
| POST | `/video` | **提交** 视频生成任务 (异步，返回 operationId) |
| POST | `/video-status` | **轮询** 视频生成状态 / 获取结果 URL |
| POST | `/speech` | 生成旁白 TTS 音频 (返回 MP3 Blob) |

### 🎨 Style 资产路由 (`/api/style/*`)

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/extract-assets` | Agent A2 · 从剧情文本提取角色/场景/道具资产 |
| POST | `/extract-assets-from-beats` | 从分镜表中补充提取资产 |
| POST | `/visual-dna` | 根据风格选择生成全局 visualTags 前缀 |
| POST | `/analyze-images` | 上传参考图 → AI 分析视觉特征 → 写入 visualTags |

### ⚙️ Config 动态配置路由

| Method | Endpoint | 说明 |
|--------|----------|------|
| GET | `/api/config` | 获取当前 Provider/模型配置 |
| POST | `/api/config` | 运行时更新配置 (内存级，不持久化) |

### 🔀 动态代理路由

| Pattern | 说明 |
|---------|------|
| `/api/proxy/:providerId/*` | 通用动态代理，根据 model-manager 配置自动路由 + 注入 Auth Header |
| `/api/t8star/*` | T8Star 静态代理 (向后兼容) |
| `/api/tutujin/*` | Tutujin (Polo) 静态代理 (向后兼容) |

> 🔐 安全性：API Key 仅存储在后端 `.env`，前端请求通过 `x-key-target` 头指示目标，由后端自动注入 `Authorization: Bearer xxx`，**永不在浏览器端暴露 Key**。

---

## 🤖 多智能体工作流详解

### 完整流水线触发顺序

```
用户输入小说文本 + 选择风格
        │
        ▼
┌─────────────────────────┐
│  Agent 1 · 叙事架构师    │  analyzeNarrative()
│  • 外科手术式压缩 90%    │  → NarrativeBlueprint
│  • 钩子工程 (黄金3秒)    │    (batch_meta + episodes[])
│  • 多巴胺曲线编排        │
└─────────────────────────┘
        │
        ▼  每集 episodes[i]
┌─────────────────────────┐
│  Agent 2 · 视觉导演      │  generateBeatSheet()
│  • 400 核心镜头组映射    │  → MasterBeatSheet
│  • 视觉对位法            │    (30 Beat / 集)
│  • 奇观工程 (390-400)    │  → Asset[] (自动提取)
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  Agent 3 · 资产制作人    │  generatePrompts()
│  • Shot ID → 英文翻译    │  → Scene[] (含完整 Prompt)
│  • 光影/纹理/风格注入    │    • np_prompt (图像)
│  • 三模态并行输出        │    • video_prompt (视频)
└─────────────────────────┘    • audio_bgm / sfx / dialogue
        │
        ▼
┌─────────────────────────┐
│  用户逐个 Scene 操作     │
│  • 生成定场图 🖼️         │
│  • 生成短视频 🎥          │
│  • 生成旁白 🔊            │
│  • 打开 Canvas 节点画布  │
└─────────────────────────┘
```

### 核心设计模式

1. **重试 + 校验机制** (`executeWithRetryAndValidation`)：
   - Agent 2/3 输出强制 JSON/格式校验
   - 失败自动指数退避重试 (最多 5 次)
   - 支持 `AbortSignal` 客户端取消

2. **镜头 ID 翻译层** (`core-lenses.ts` → `toCompactLensLibrary()`)：
   - `[001] 大特写` → `"Extreme close-up, macro details, iris texture visible..."`
   - `[395] 蝴蝶效应` → `"Macro shot of butterfly wings flapping, dust swirling..."`
   - Agent 2 只输出 ID，Agent 3 查询翻译表生成英文 Prompt

3. **样式前缀注入** (`computeStylePrefix()`)：
   - 所有 Prompt 自动前置 `visualDna + workStyle + textureStyle`
   - 保证全片视觉风格统一

---

## 🧪 测试体系

详见 [tests/README.md](file:///d:/work/duanju/duanju/tests/README.md)

### 命令速查

```bash
# ===== 单元测试 =====
npm run test              # 前端单测 (Vitest)
npm run test:watch        # 前端单测 (watch 模式)
npm run test:server       # 后端单测 (Vitest + Supertest)
npm run test:all          # 前端 + 后端 一次性跑完

# ===== E2E 测试 =====
npm run test:e2e              # Playwright 无头模式 (Mock API, ~2min)
npm run test:e2e:headed       # Playwright 有头模式 (Mock API)
npm run test:e2e:ui           # Playwright UI 调试台
npm run test:e2e:real         # 有头模式 + 真实 API 调用 (~15-30min)
npm run test:e2e:real:headless # 无头 + 真实 API (CI 用)
```

### 覆盖率

| 层级 | 测试文件数 | 覆盖范围 |
|------|-----------|---------|
| 前端单测 | 10 | API 层 / 资产标签 / 场景管理 / 工具函数 / Chunk 导入导出 / 会话恢复 |
| 后端单测 | 12 | 路由校验 / Pipeline / Providers / ModelManager / 音视频生成 / 核心镜头库 |
| E2E | 6 | Flow 1-6 覆盖：风格设置 → 叙事流水线 → 多媒体 → 请求链路 → 持久化 → 全自动 |

---

## 📦 构建与部署

### Electron 桌面应用 (Windows)

```bash
# 1. 构建前端 + 后端 TS
npm run electron:build

# 2. 仅本地解包 (不生成安装包，快速验证)
npm run electron:pack
# → 输出到 node_modules/.cache/dist-electron/win-unpacked/

# 3. 生成 NSIS 安装包 + Portable 便携版
npm run electron:dist
# → 输出 .exe 安装包 和 .zip 便携版

# 4. 发布到 GitHub Releases (需 GH_TOKEN)
npm run electron:publish
```

**打包配置** 位于 [package.json](file:///d:/work/duanju/duanju/package.json#L58-L95) `build` 字段：
- AppID: `com.nanobanana.storyboarder`
- 产品名: `NanoBanana Storyboarder`
- 图标: `public/icon.png`
- 目标: NSIS 安装向导 + Portable 免安装
- 自动更新: electron-updater + GitHub Releases

### Docker 容器化

[Dockerfile](file:///d:/work/duanju/duanju/Dockerfile) 采用 **三阶段多阶段构建**，镜像极小：

```bash
# 构建镜像
docker build -t nanobanana-storyboarder:latest .

# 运行容器 (端口 8080)
docker run -d \
  -p 8080:8080 \
  --env-file .env \
  --name storyboarder \
  nanobanana-storyboarder:latest

# 访问
open http://localhost:8080
```

**构建阶段说明**：
1. Stage 1 `frontend-builder`: 构建 Vite SPA → `dist/`
2. Stage 2 `server-builder`: `tsc` 编译后端 TS → `server/dist/`
3. Stage 3 `production`: `node:20-slim` 仅复制产物 + `--omit=dev` 依赖，镜像约 300MB

### Google Cloud 部署

一键部署脚本 [deploy.ps1](file:///d:/work/duanju/duanju/deploy.ps1) (Windows PowerShell):

```powershell
# 需要先安装 gcloud CLI 并登录
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 执行部署
.\deploy.ps1
```

---

## 🔒 安全与隐私

1. **API Key 保护**: Key 仅存储于后端 `.env`，前端通过 `x-key-target` 间接引用，注入逻辑在 [server/src/index.ts](file:///d:/work/duanju/duanju/server/src/index.ts#L92-L117)
2. **速率限制**: `/api/*` 全局 100 次/分钟/IP，简单内存级限流
3. **CORS 策略**: 生产模式关闭跨域 (`origin: false`)，开发模式全开放
4. **错误捕获**: 全局 `unhandledRejection` / `uncaughtException` 钩子防止进程崩溃
5. **僵尸进程防护**: Electron 父进程断开时自动 `process.exit(0)`
6. **无头 Electron 请求安全**: 生成媒体 URL 通过 Blob URL + IndexedDB 本地化，不暴露给第三方

---

## 📝 开发指南

### 新增 AI Provider

1. 在 [server/src/services/ai/providers/interfaces.ts](file:///d:/work/duanju/duanju/server/src/services/ai/providers/interfaces.ts) 实现接口
2. 在 [openai-compatible.ts](file:///d:/work/duanju/duanju/server/src/services/ai/providers/openai-compatible.ts) 继承基类或自定义
3. 在 [providers/index.ts](file:///d:/work/duanju/duanju/server/src/services/ai/providers/index.ts) 注册
4. 在 [model-manager.ts](file:///d:/work/duanju/duanju/server/src/services/ai/model-manager.ts) 的默认配置中加入 Provider 声明
5. 在 `.env` 中添加 `{PREFIX}_TEXT_API_KEY` / `{PREFIX}_BASE_URL` 等变量
6. 前端 [SettingsPanel](file:///d:/work/duanju/duanju/src/ui/panels/SettingsPanel.tsx) 会自动读取，无需修改 UI

### 新增镜头 (Core Lens)

1. 打开 [core-lenses.ts](file:///d:/work/duanju/duanju/server/src/domain/generation/core-lenses.ts)
2. 在对应分类数组中追加对象：
   ```typescript
   {
     id: "401",
     name: "镜头中文名",
     englishName: "English Name",
     description: "适用场景说明",
     keywords: ["english", "keywords", "for", "prompt"],
     videoPrompt: "默认视频 Prompt 片段",
     imagePrompt: "默认图像 Prompt 片段",
     cameraMovement: "Camera movement description"
   }
   ```
3. Agent 2 的 SKILL.md 文档同步更新提示词范围

### 新增语言翻译

1. 打开 [translations.ts](file:///d:/work/duanju/duanju/src/services/i18n/translations.ts)
2. 在每个 key 对象中追加语言字段：
   ```typescript
   appTitle: {
     Chinese: "NanoBanana 分镜大师",
     English: "NanoBanana Storyboarder",
     Japanese: "新しい言語のタイトル",  // ← 追加
     Korean: "..."
   }
   ```
3. 在 `App.tsx` 的语言下拉框中添加 `<option>`

---

## 🐛 常见问题

| 问题 | 解决方案 |
|------|---------|
| 前端启动后白屏 | 检查后端是否启动 (http://localhost:3002)；控制台看 `/api/config` 是否 502 |
| 视频生成一直 PENDING | T8Star/Polo 视频是异步任务，通常 5-30 分钟；检查 `video-status` 轮询日志 |
| Agent 返回乱码/格式错误 | 自动重试机制已处理 5 次；仍失败请降低 `directorStrength` 或简化输入文本 |
| 国内访问 Gemini 超时 | 配置 `.env` 中 `HTTPS_PROXY=http://127.0.0.1:7897` (改为你本地代理端口) |
| IndexedDB 损坏导致无法加载 | 点击右上角 🗑️ 按钮清除缓存并重置，或 DevTools → Application → IndexedDB 手动删除 |
| Electron 打包时报 asar 错误 | 当前配置 `asar: false`，不要改为 true，否则 Skill 文档和二进制文件路径异常 |

---

---

## 🔗 相关资源

- 核心设计文档: [docs/agent.md](file:///d:/work/duanju/duanju/docs/agent.md) — Agent 1/2/3 System Prompt 全文
- 镜头组说明: [docs/核心镜头组.md](file:///d:/work/duanju/duanju/docs/%E6%A0%B8%E5%BF%83%E9%95%9C%E5%A4%B4%E7%BB%84.md) — 400 镜头详细说明
- Seedance 集成: [docs/seedance2.md](file:///d:/work/duanju/duanju/docs/seedance2.md)
- 测试文档: [tests/README.md](file:///d:/work/duanju/duanju/tests/README.md) — 完整 E2E 测试矩阵
