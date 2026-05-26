import { Router, Request, Response } from 'express';
import { generateAssetImage, generateSceneImage, buildAssetPrompt, reverseEngineerAngles } from '../services/ai/media/image';
import { submitVideoGeneration, pollVideoStatus } from '../services/ai/media/video';
import { generateSpeech } from '../services/ai/media/audio';
import { getModelManager } from '../services/ai/model-manager';
import multer from 'multer';

const upload = multer({
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    storage: multer.memoryStorage()
});

const router = Router();

// POST /api/media/asset-image
router.post('/asset-image', async (req: Request, res: Response) => {
    const controller = new AbortController();
    const handleClose = () => {
        if (!res.writableEnded) {
            console.log('[Media/asset-image] Connection closed prematurely by client, aborting request');
            controller.abort();
        }
    };
    res.on('close', handleClose);

    try {
        const { asset, globalStyle, existingAssets, overridePrompt, referenceImage } = req.body;
        if (!asset) {
            return res.status(400).json({ error: 'Missing required field: asset' });
        }

        const result = await generateAssetImage(asset, globalStyle, existingAssets || [], overridePrompt, referenceImage, controller.signal);
        res.json(result);
    } catch (e: any) {
        if (e.name === 'AbortError' || controller.signal.aborted) {
            console.log('[Media/asset-image] Request aborted successfully');
            if (!res.headersSent) {
                res.status(499).json({ error: 'Request cancelled' });
            }
        } else {
            console.error('[Media/asset-image]', e);
            if (!res.headersSent) {
                res.status(500).json({ error: e?.message || 'Internal error' });
            }
        }
    } finally {
        res.off('close', handleClose);
    }
});

// POST /api/media/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const modelManager = getModelManager();
        const url = await modelManager.uploadFile(file.buffer, file.mimetype, file.originalname || 'upload.bin');
        res.json({ url });
    } catch (e: any) {
        console.error('[Media/upload]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

import fetch from 'node-fetch';

// GET /api/media/download-proxy
// Proxies video/image downloads from external CDNs to bypass browser CORS restrictions
router.get('/download-proxy', async (req: Request, res: Response) => {
    const mediaUrl = req.query.url as string;
    if (!mediaUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
            console.error(`[Media/download-proxy] Remote fetch failed with status: ${response.status}`);
            return res.status(response.status).send(`Failed to fetch media: ${response.statusText}`);
        }
        res.writeHead(response.status, {
            'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
            'Content-Length': response.headers.get('content-length') || '',
            'Cache-Control': 'no-cache'
        });
        
        const arrayBuf = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
    } catch (e: any) {
        console.error('[Media/download-proxy] Exception:', e);
        if (!res.headersSent) {
            res.status(500).send(e?.message || 'Internal error');
        }
    }
});

// POST /api/media/scene-image
router.post('/scene-image', async (req: Request, res: Response) => {
    const controller = new AbortController();
    const handleClose = () => {
        if (!res.writableEnded) {
            console.log('[Media/scene-image] Connection closed prematurely by client, aborting request');
            controller.abort();
        }
    };
    res.on('close', handleClose);

    try {
        const { scene, globalStyle, assets, optionId } = req.body;
        if (!scene) {
            return res.status(400).json({ error: 'Missing required field: scene' });
        }

        const result = await generateSceneImage(scene, globalStyle, assets || [], optionId, controller.signal);
        res.json(result);
    } catch (e: any) {
        if (e.name === 'AbortError' || controller.signal.aborted) {
            console.log('[Media/scene-image] Request aborted successfully');
            if (!res.headersSent) {
                res.status(499).json({ error: 'Request cancelled' });
            }
        } else {
            console.error('[Media/scene-image]', e);
            if (!res.headersSent) {
                res.status(500).json({ error: e?.message || 'Internal error' });
            }
        }
    } finally {
        res.off('close', handleClose);
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

// GET /api/media/video-status-sse
router.get('/video-status-sse', async (req: Request, res: Response) => {
    const operationStr = req.query.operation as string;
    if (!operationStr) {
        return res.status(400).send('Missing query parameter: operation');
    }

    let operation: any;
    try {
        operation = JSON.parse(decodeURIComponent(operationStr));
    } catch (e) {
        return res.status(400).send('Invalid operation payload');
    }

    // Set up Server-Sent Events headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();

    let isClosed = false;
    let timerId: NodeJS.Timeout | undefined;

    const checkStatus = async () => {
        if (isClosed) return;
        try {
            const result = await pollVideoStatus(operation);
            if (isClosed) return;

            if (result.done) {
                res.write(`data: ${JSON.stringify({ type: 'done', url: result.url, error: result.error })}\n\n`);
                res.end();
                if (timerId) clearInterval(timerId);
            } else {
                res.write(`data: ${JSON.stringify({ type: 'poll' })}\n\n`);
            }
        } catch (err: any) {
            if (isClosed) return;
            console.error('[Media/video-status-sse] Error polling status:', err);
            res.write(`data: ${JSON.stringify({ type: 'done', error: err?.message || 'Internal polling error' })}\n\n`);
            res.end();
            if (timerId) clearInterval(timerId);
        }
    };

    // Run first check immediately
    await checkStatus();

    // Start polling interval
    if (!isClosed) {
        timerId = setInterval(checkStatus, 5000);
    }

    req.on('close', () => {
        isClosed = true;
        if (timerId) {
            clearInterval(timerId);
        }
        console.log('[Media/video-status-sse] Connection closed by client, stopped background polling.');
    });
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
        
        const result = await reverseEngineerAngles(description, targetAngles, imageBase64, language);
        res.json({ result });
    } catch (e: any) {
        console.error('[Media/reverse-angles]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/media/refresh-url
router.post('/refresh-url', async (req: Request, res: Response) => {
    try {
        const { operation } = req.body;
        if (!operation) {
            return res.status(400).json({ error: 'Missing required field: operation' });
        }

        const result = await pollVideoStatus(operation);
        res.json(result);
    } catch (e: any) {
        console.error('[Media/refresh-url]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
