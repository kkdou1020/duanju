import { Router, Request, Response } from 'express';
import { getModelManager } from '../services/ai/model-manager';

const router = Router();

// GET /api/config
router.get('/', (req: Request, res: Response) => {
    const mm = getModelManager();
    res.json(mm.getConfig());
});

// POST /api/config
router.post('/', (req: Request, res: Response) => {
    try {
        const { textmodel, imagemodel, videomodel, t8starTextModel, t8starImageModel, t8starImageSize, t8starImageQuality, t8starNanoImageSize, t8starNanoAspectRatio, t8starVideoModel } = req.body;
        const mm = getModelManager();
        mm.setConfig({ textmodel, imagemodel, videomodel, t8starTextModel, t8starImageModel, t8starImageSize, t8starImageQuality, t8starNanoImageSize, t8starNanoAspectRatio, t8starVideoModel });
        res.json(mm.getConfig());
    } catch (e: any) {
        console.error('[Config]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
