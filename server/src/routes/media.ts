import { Router, Request, Response } from 'express';
import { generateAssetImage, generateSceneImage, buildAssetPrompt } from '../services/ai/media/image';
import { submitVideoGeneration, pollVideoStatus } from '../services/ai/media/video';
import { generateSpeech } from '../services/ai/media/audio';

const router = Router();

// POST /api/media/asset-image
router.post('/asset-image', async (req: Request, res: Response) => {
    try {
        const { asset, globalStyle, existingAssets, overridePrompt, referenceImage } = req.body;
        if (!asset) {
            return res.status(400).json({ error: 'Missing required field: asset' });
        }

        const result = await generateAssetImage(asset, globalStyle, existingAssets || [], overridePrompt, referenceImage);
        res.json(result);
    } catch (e: any) {
        console.error('[Media/asset-image]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/scene-image
router.post('/scene-image', async (req: Request, res: Response) => {
    try {
        const { scene, globalStyle, assets, optionId } = req.body;
        if (!scene) {
            return res.status(400).json({ error: 'Missing required field: scene' });
        }

        const result = await generateSceneImage(scene, globalStyle, assets || [], optionId);
        res.json(result);
    } catch (e: any) {
        console.error('[Media/scene-image]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/video — Submit task, return immediately
router.post('/video', async (req: Request, res: Response) => {
    try {
        const { imageBase64, scene, aspectRatio, assets, globalStyle, allScenes, optionId } = req.body;
        if (!scene) {
            return res.status(400).json({ error: 'Missing required field: scene' });
        }

        const result = await submitVideoGeneration(
            imageBase64,
            scene,
            aspectRatio,
            assets || [],
            globalStyle,
            allScenes,
            optionId
        );
        res.json(result);
    } catch (e: any) {
        console.error('[Media/video]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/video-status
router.post('/video-status', async (req: Request, res: Response) => {
    try {
        const { operation } = req.body;
        if (!operation) {
            return res.status(400).json({ error: 'Missing required field: operation' });
        }

        // Use pollVideoStatus which normalizes the raw SDK response
        // into { done, url?, error? } that the frontend expects
        const result = await pollVideoStatus(operation);
        res.json(result);
    } catch (e: any) {
        console.error('[Media/video-status]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/speech
router.post('/speech', async (req: Request, res: Response) => {
    try {
        const { text, voice, scene } = req.body;
        if (!text && !scene) {
            return res.status(400).json({ error: 'Missing required field: text or scene' });
        }

        const result = await generateSpeech(text || scene?.narration || '', voice);
        res.json(result);
    } catch (e: any) {
        console.error('[Media/speech]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/build-asset-prompts — Pre-generate prompts (pure computation, no AI)
router.post('/build-asset-prompts', (req: Request, res: Response) => {
    try {
        const { assets, globalStyle } = req.body;
        if (!assets || !globalStyle) {
            return res.status(400).json({ error: 'Missing required fields: assets, globalStyle' });
        }

        const result = assets.map((asset: any) => ({
            ...asset,
            prompt: asset.prompt || buildAssetPrompt(asset, globalStyle)
        }));
        res.json({ assets: result });
    } catch (e: any) {
        console.error('[Media/build-asset-prompts]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/reverse-angles
router.post('/reverse-angles', async (req: Request, res: Response) => {
    try {
        const { description, targetAngles, imageBase64, language } = req.body;
        if (!description || !targetAngles || !Array.isArray(targetAngles)) {
            return res.status(400).json({ error: 'Missing description or targetAngles' });
        }
        
        // Dynamic import since it's a new export that might not be at the top level here yet
        const { reverseEngineerAngles } = require('../services/ai/media/image');
        const result = await reverseEngineerAngles(description, targetAngles, imageBase64, language);
        res.json({ result });
    } catch (e: any) {
        console.error('[Media/reverse-angles]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
