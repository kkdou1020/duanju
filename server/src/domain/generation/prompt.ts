import fs from 'fs';
import path from 'path';
import { Asset } from "../../shared/types";

const MAX_ASSETS_IN_PROMPT = 50;

/**
 * 符合 SKILL 规范的动态加载器
 * 读取 skills/<skillName>/SKILL.md，正则匹配并剥离头部的 YAML Frontmatter 区域
 */
function getSkillPrompt(skillName: string): string {
    // 1. 探测路径：开发环境下 tsx 执行 (相对于当前源文件 __dirname/skills/...)
    let filePath = path.join(__dirname, 'skills', skillName, 'SKILL.md');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/i, '').trim();
    }
    
    // 2. 探测路径：编译部署 dist 后的 fallback 路径 (回溯至 src)
    filePath = path.join(__dirname, '..', '..', '..', 'src', 'domain', 'generation', 'skills', skillName, 'SKILL.md');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/i, '').trim();
    }
    
    // 3. 兜底路径：相对于进程工作根目录的相对寻找
    filePath = path.resolve('src/domain/generation/skills', skillName, 'SKILL.md');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/i, '').trim();
    }
    
    throw new Error(`[Loader] 找不到符合 SKILL 规范的配置文件：skills/${skillName}/SKILL.md`);
}

export interface Agent1NarrativeConfig {
  batchInstruction: string;
  language: string;
  text: string;
  prevContext: string;
  isBatched: boolean;
  episodeRange: string;
  currentBatchNum: number;
  totalBatches: number;
  directorStyle?: string;
  directorStrength?: number;
}

interface PromptFunctions {
  AGENT_A_DNA: (workStyle: string, textureStyle: string, language: string, useOriginalCharacters?: boolean) => string;
  AGENT_A_ASSET: (language: string, existingAssets: Asset[], workStyle?: string, useOriginalCharacters?: boolean) => string;
  AGENT_A2_FROM_BEATS: (language: string, existingAssets: Asset[], workStyle?: string, useOriginalCharacters?: boolean) => string;
  VISUAL_DNA_FROM_IMAGES: (language: string) => string;
  AGENT_1_NARRATIVE: (config: Agent1NarrativeConfig) => string;
  AGENT_2_ANNOTATE: (language: string, lensLibraryPrompt: string, visualDna: string, narrativeContext: string) => string;
  AGENT_3_ASSET_PRODUCER: (fullLensLibrary: string, language: string, stylePrefix: string, assetMap: string, aspectRatio?: string) => string;
}

export const PROMPTS: PromptFunctions = {
  AGENT_A_DNA: (workStyle: string, textureStyle: string, language: string, useOriginalCharacters: boolean = false) => {
    let originalCharInstruction = "";
    if (useOriginalCharacters && workStyle) {
      originalCharInstruction = `**1:1 还原覆盖指令**: 因为用户勾选了 1:1 影视还原，你必须在风格字符串末尾追加原著名称。\n输出格式范例: "[艺术媒介][时代风格][配色方案][光影特征][材质细节][《${workStyle}》风格], "`;
    }
    return getSkillPrompt('agent-a-dna')
      .replace('{{workStyle}}', workStyle)
      .replace('{{textureStyle}}', textureStyle)
      .replace('{{language}}', language)
      .replace('{{originalCharInstruction}}', originalCharInstruction);
  },

  AGENT_A_ASSET: (language: string, existingAssets: Asset[], workStyle: string = "", useOriginalCharacters: boolean = false) => {
    const truncatedAssets = existingAssets.slice(0, MAX_ASSETS_IN_PROMPT);
    const existingList = JSON.stringify(truncatedAssets.map(a => ({ id: a.id, name: a.name })));

    let originalCharInstruction = "";
    if (useOriginalCharacters && workStyle) {
      originalCharInstruction = `
         6. **原著造型检测 (1:1还原模式)**: 
            - 检查文本中的任何角色、场景（地点）或道具是否与参考作品匹配: "${workStyle}"。
            - 如果匹配成功:
              1. 描述段落开头强制填写: "影视剧《${workStyle}》${language === 'Chinese' ? '' : ' '}"。
              2. **至关重要**: 你必须基于原著/影视剧描述其**标志性的长相/服饰/外观特征**。
              3. 描述段落结尾强制填写: ", 1:1还原, 原影视造型"。
            - 示例（人物）: "影视剧《Conan》人物 Conan, blue blazer, gray shorts, red bowtie... , 1:1还原, 原影视造型"。
            - 示例（场景）: "影视剧《Harry Potter》场景 Hogwarts Great Hall, floating candles... , 1:1还原, 原影视造型"。
            - 示例（道具）: "影视剧《Iron Man》物品 Arc Reactor, glowing blue circle... , 1:1还原, 原影视造型"。
         `;
    }

    return getSkillPrompt('agent-a-asset')
      .replace('{{existingList}}', existingList)
      .replace('{{language}}', language)
      .replace('{{originalCharInstruction}}', originalCharInstruction);
  },

  AGENT_A2_FROM_BEATS: (language: string, existingAssets: Asset[], workStyle: string = "", useOriginalCharacters: boolean = false) => {
    const truncatedAssets = existingAssets.slice(0, MAX_ASSETS_IN_PROMPT);
    const existingList = JSON.stringify(truncatedAssets.map(a => ({ id: a.id, name: a.name, type: a.type || 'character' })));

    let originalCharInstruction = "";
    if (useOriginalCharacters && workStyle) {
      originalCharInstruction = `
**1:1 还原规则**: 如果角色/场景/道具来自已知作品「${workStyle}」:
  - description 开头写: "影视剧《${workStyle}》"
  - 描述该作品中的**标志性外观**
  - description 结尾写: ", 1:1还原, 原影视造型"`;
    }

    return getSkillPrompt('agent-a-asset')
      .replace('{{existingList}}', existingList)
      .replace('{{language}}', language)
      .replace('{{originalCharInstruction}}', originalCharInstruction);
  },

  VISUAL_DNA_FROM_IMAGES: (language: string) => {
    return getSkillPrompt('agent-a-dna')
      .replace('{{language}}', language);
  },

  AGENT_1_NARRATIVE: ({ batchInstruction, language, text, prevContext, isBatched, episodeRange, currentBatchNum, totalBatches, directorStyle, directorStrength }: Agent1NarrativeConfig) => {
    let directorStyleAnchor = "";
    if (directorStyle) {
      directorStyleAnchor = `
1.5 导演风格锚定 (Director Anchor): 「${directorStyle}」(强度 ${directorStrength || 5}/10)
- 强度映射：1-3 仅借鉴节奏编排 → 4-7 融入其台词风格与悬念手法 → 8-10 全面模仿其叙事语法与标志性元素。
- 铁律：导演风格仅作用于"怎么讲"，不得覆盖原文"讲什么"——情感保真铁律优先级永远高于导演风格。
`;
    }

    let batchContext = isBatched ? `**Batch Context**: Currently generating ${episodeRange}.` : "";

    return getSkillPrompt('agent1-narrative')
      .replace('{{directorStyleAnchor}}', directorStyleAnchor)
      .replace('{{language}}', language)
      .replace('{{text}}', text)
      .replace('{{prevContext}}', prevContext)
      .replace('{{batchContext}}', batchContext)
      .replace('{{currentBatchNum}}', String(currentBatchNum))
      .replace('{{totalBatches}}', String(totalBatches))
      .replace('{{episodeRange}}', episodeRange)
      .replace('{{batchInstruction}}', batchInstruction);
  },

  AGENT_2_ANNOTATE: (language: string, lensLibraryPrompt: string, visualDna: string, narrativeContext: string) => {
    return getSkillPrompt('agent2-visual')
      .replace('{{lensLibraryPrompt}}', lensLibraryPrompt)
      .replace('{{language}}', language)
      .replace('{{visualDna}}', visualDna)
      .replace('{{narrativeContext}}', narrativeContext);
  },

  AGENT_3_ASSET_PRODUCER: (fullLensLibrary: string, language: string, stylePrefix: string, assetMap: string, aspectRatio: string = '16:9') => {
    return getSkillPrompt('agent3-asset')
      .replace('{{fullLensLibrary}}', fullLensLibrary)
      .replace('{{language}}', language)
      .replace('{{stylePrefix}}', stylePrefix)
      .replace('{{assetMap}}', assetMap);
  }
};
