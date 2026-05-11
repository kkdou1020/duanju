import { Router, Request, Response } from 'express';
import { analyzeNarrative, generateBeatSheet, generatePromptsFromBeats, generatePromptsFromBeatsStream, generateEpisodeScenes } from '../services/ai/agents/pipeline';

const router = Router();

// POST /api/pipeline/analyze
router.post('/analyze', async (req: Request, res: Response) => {
    try {
        const { text, language, prevContext, episodeCount, directorStyle, directorStrength } = req.body;
        if (!text || !language) {
            return res.status(400).json({ error: 'Missing required fields: text, language' });
        }

        const result = await analyzeNarrative(
            text,
            language,
            prevContext || '',
            episodeCount,
            undefined,
            undefined,
            directorStyle,
            directorStrength
        );
        res.json(result);
    } catch (e: any) {
        console.error('[Pipeline/analyze]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/pipeline/beat-sheet
router.post('/beat-sheet', async (req: Request, res: Response) => {
    try {
        const { episode, batch_meta, language, style, existingAssets, overrideText } = req.body;
        if (!episode || !language || !style) {
            return res.status(400).json({ error: 'Missing required fields: episode, language, style' });
        }

        const result = await generateBeatSheet(
            episode,
            batch_meta || {},
            language,
            style,
            existingAssets || [],
            overrideText
        );
        res.json(result);
    } catch (e: any) {
        console.error('[Pipeline/beat-sheet]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/pipeline/prompts
router.post('/prompts', async (req: Request, res: Response) => {
    try {
        const { beatSheet, episodeNumber, language, assets, style } = req.body;
        if (!beatSheet || !language || !style) {
            return res.status(400).json({ error: 'Missing required fields: beatSheet, language, style' });
        }

        const result = await generatePromptsFromBeats(
            beatSheet,
            episodeNumber || 0,
            language,
            assets || [],
            style
        );
        res.json({ scenes: result.scenes, visualDna: result.visualDna });
    } catch (e: any) {
        console.error('[Pipeline/prompts]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/pipeline/retry-single-beat
router.post('/retry-single-beat', async (req: Request, res: Response) => {
    try {
        const { beat, episodeNumber, language, style, assets } = req.body;
        if (!beat || !language || !style) {
            return res.status(400).json({ error: 'Missing required fields: beat, language, style' });
        }

        const beatSheet = {
            beats: [beat],
            summary: "Single beat regeneration"
        };

        const result = await generatePromptsFromBeats(
            beatSheet as any,
            episodeNumber || 0,
            language,
            assets || [],
            style
        );

        if (result.scenes && result.scenes.length > 0) {
            res.json({ scene: result.scenes[0] });
        } else {
            res.status(500).json({ error: "Failed to regenerate beat" });
        }
    } catch (e: any) {
        console.error('[Pipeline/retry-single-beat]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/pipeline/prompts-stream
router.post('/prompts-stream', async (req: Request, res: Response) => {
    try {
        const { beatSheet, episodeNumber, language, assets, style } = req.body;
        if (!beatSheet || !language || !style) {
            return res.status(400).json({ error: 'Missing required fields: beatSheet, language, style' });
        }

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        const generator = generatePromptsFromBeatsStream(
            beatSheet,
            episodeNumber || 0,
            language,
            assets || [],
            style
        );

        for await (const chunk of generator) {
            res.write(JSON.stringify({ type: 'chunk', ...chunk }) + '\n');
        }
        res.end();
    } catch (e: any) {
        console.error('[Pipeline/prompts-stream]', e);
        if (!res.headersSent) {
            res.status(500).json({ error: e?.message || 'Internal error' });
        } else {
            res.write(JSON.stringify({ type: 'error', error: e?.message || 'Internal error' }) + '\n');
            res.end();
        }
    }
});

// POST /api/pipeline/episode-scenes (legacy combined)
router.post('/episode-scenes', async (req: Request, res: Response) => {
    try {
        const { episode, batch_meta, language, assets, style, overrideText } = req.body;
        if (!episode || !language || !style) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await generateEpisodeScenes(
            episode,
            batch_meta || {},
            language,
            assets || [],
            style,
            overrideText
        );
        res.json({ scenes: result });
    } catch (e: any) {
        console.error('[Pipeline/episode-scenes]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
