import { Router, Request, Response } from 'express';
import { getModelManager } from '../services/ai/model-manager';
import nodeFetch from 'node-fetch';
import { getProxyAgent } from '../services/ai/helpers';

const router = Router();

// GET /api/config
router.get('/', (req: Request, res: Response) => {
    const mm = getModelManager();
    res.json(mm.getConfig());
});

// POST /api/config
router.post('/', (req: Request, res: Response) => {
    try {
        const { textmodel, imagemodel, videomodel, t8starTextModel, t8starImageModel, t8starImageSize, t8starImageQuality, t8starNanoImageSize, t8starNanoAspectRatio, t8starVideoModel, providers } = req.body;
        const mm = getModelManager();
        mm.setConfig({ textmodel, imagemodel, videomodel, t8starTextModel, t8starImageModel, t8starImageSize, t8starImageQuality, t8starNanoImageSize, t8starNanoAspectRatio, t8starVideoModel, providers });
        res.json(mm.getConfig());
    } catch (e: any) {
        console.error('[Config]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

router.post('/test-connection', async (req: Request, res: Response) => {
    try {
        const { baseUrl, apiKey } = req.body;
        if (!baseUrl) {
            return res.status(400).json({ error: 'Base URL is required' });
        }
        let url = baseUrl.trim().replace(/\/+$/, "");
        if (url.endsWith('/chat/completions')) {
            // Already complete, do nothing
        } else if (url.endsWith('/v1')) {
            url = `${url}/chat/completions`;
        } else {
            url = `${url}/v1/chat/completions`;
        }
        console.log(`[Config] Testing connection to ${url}...`);

        const testBody = {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s connection timeout

        const agent = getProxyAgent(url);

        const response = await nodeFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify(testBody),
            signal: controller.signal as any,
            ...(agent ? { agent } : {})
        });

        clearTimeout(timeout);

        if (response.ok) {
            console.log(`[Config] Connection to ${url} succeeded!`);
            res.json({ success: true, message: '连接成功！' });
        } else {
            const errText = await response.text().catch(() => '');
            console.warn(`[Config] Connection test returned HTTP ${response.status}: ${errText}`);
            res.json({ success: false, error: `HTTP ${response.status}: ${errText.substring(0, 100)}` });
        }
    } catch (e: any) {
        console.error('[Config] Connection test failed:', e);
        res.json({ success: false, error: e?.message || '连接失败' });
    }
});

export default router;
