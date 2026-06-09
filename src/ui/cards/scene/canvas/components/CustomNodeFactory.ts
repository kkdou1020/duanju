import { AssetNode } from '../nodes/AssetNode';
import { SceneRefNode } from '../nodes/SceneRefNode';
import { ImagePromptNode } from '../nodes/ImagePromptNode';
import { ImageOutputNode } from '../nodes/ImageOutputNode';
import { VideoPromptNode } from '../nodes/VideoPromptNode';
import { VideoOutputNode } from '../nodes/VideoOutputNode';
import { FirstLastFrameNode } from '../nodes/FirstLastFrameNode';
import { CustomNoteNode } from '../nodes/CustomNoteNode';

export const nodeTypes = {
    asset: AssetNode,
    sceneRef: SceneRefNode,
    imagePrompt: ImagePromptNode,
    imageOutput: ImageOutputNode,
    videoPrompt: VideoPromptNode,
    videoOutput: VideoOutputNode,
    firstLastFrame: FirstLastFrameNode,
    customNote: CustomNoteNode
};
