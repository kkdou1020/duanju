import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

// Global error handlers to prevent backend from crashing on unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('🔥 [Unhandled Rejection] caught globally:');
    console.error('Promise:', promise);
    console.error('Reason:', reason?.stack || reason);
});

process.on('uncaughtException', (error: Error) => {
    console.error('🔥 [Uncaught Exception] caught globally:');
    console.error('Error Stack:', error.stack || error);
});

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import business logic routes
import pipelineRouter from './routes/pipeline';
import mediaRouter from './routes/media';
import styleRouter from './routes/style';

import configRouter from './routes/config';

const app = express();
const PORT = process.env.PORT || 3002;

// CORS
if (process.env.NODE_ENV === 'production') {
    app.use(cors({ origin: false }));
} else {
    app.use(cors());
}

// Parse JSON body (200MB limit for large base64 image payloads)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 100;

app.use('/api/', (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }
    record.count++;
    rateLimitMap.set(ip, record);

    if (record.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
});

// ===== NEW: Business Logic Routes =====
app.use((req, res, next) => {
    console.log(`[Express] Received ${req.method} ${req.originalUrl}`);
    next();
});

app.use('/api/pipeline', pipelineRouter);
app.use('/api/media', mediaRouter);
app.use('/api/style', styleRouter);

app.use('/api/config', configRouter);

// ===== LEGACY: Proxy Routes (kept for backward compatibility) =====
const getApiKey = (target: string) => {
    switch (target) {
        case 'T8_TEXT': return process.env.T8_TEXT_API_KEY || process.env.TEXT_API_KEY;
        case 'T8_IMAGE': return process.env.T8_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
        case 'T8_VIDEO': return process.env.T8_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
        case 'T8_AUDIO': return process.env.T8_AUDIO_API_KEY || process.env.AUDIO_API_KEY;
        case 'POLO_TEXT': return process.env.POLO_TEXT_API_KEY || process.env.GEMINI_TEXT_API_KEY || process.env.API_KEY;
        case 'POLO_IMAGE': return process.env.POLO_IMAGE_API_KEY || process.env.GEMINI_IMAGE_API_KEY;
        case 'POLO_VIDEO': return process.env.POLO_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
        default: return null;
    }
};

const injectAuthHeader = (proxyReq: any, req: any) => {
    const keyTarget = req.headers['x-key-target'];
    if (keyTarget) {
        const apiKey = getApiKey(keyTarget);
        if (apiKey) {
            const authValue = apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`;
            proxyReq.setHeader('Authorization', authValue);
        }
        proxyReq.removeHeader('x-key-target');
    }
};

app.use(
    '/api/t8star',
    createProxyMiddleware({
        target: 'https://ai.t8star.cn',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
        pathRewrite: { '^/api/t8star': '' },
        onProxyReq: (proxyReq, req) => {
            injectAuthHeader(proxyReq, req);
            console.log(`[T8Star Proxy] ${req.method} ${req.url} -> ${proxyReq.path}`);
        },
        onProxyRes: (proxyRes, req) => {
            delete proxyRes.headers['content-length'];
            if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
                let body = '';
                proxyRes.on('data', (chunk: any) => { body += chunk.toString(); });
                proxyRes.on('end', () => {
                    console.error(`[T8Star Proxy] ERROR ${proxyRes.statusCode} for ${req.method} ${req.url}`);
                    console.error(`[T8Star Proxy] Response body: ${body.substring(0, 500)}`);
                });
            }
        },
        onError: (err, req, res: any) => {
            console.error('Proxy Error (T8Star):', err);
            res.status(500).send('Proxy Error');
        }
    })
);

app.use(
    '/api/polo',
    createProxyMiddleware({
        target: 'https://work.poloapi.com',
        changeOrigin: true,
        secure: false,
        pathRewrite: { '^/api/polo': '' },
        onProxyReq: injectAuthHeader,
        onError: (err, req, res: any) => {
            console.error('Proxy Error (Polo):', err);
            res.status(500).send('Proxy Error');
        }
    })
);

// Serve static files
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
    if (req.accepts('html')) {
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
            if (err) {
                res.status(404).send('Frontend not built. Please run "npm run build" in the root directory.');
            }
        });
    } else {
        res.status(404).send('Not Found');
    }
});

// Global Express Error Handler Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ [Express Router Error] caught globally:', err?.stack || err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Business Logic API routes:');
    console.log('  POST /api/pipeline/analyze');
    console.log('  POST /api/pipeline/beat-sheet');
    console.log('  POST /api/pipeline/prompts');
    console.log('  POST /api/pipeline/episode-scenes');
    console.log('  POST /api/media/asset-image');
    console.log('  POST /api/media/scene-image');
    console.log('  POST /api/media/video');
    console.log('  POST /api/media/video-status');
    console.log('  POST /api/media/speech');
    console.log('  POST /api/style/extract-assets');
    console.log('  POST /api/style/visual-dna');
    console.log('  POST /api/style/analyze-images');
    console.log('  POST /api/style/extract-assets-from-beats');
    console.log('  GET/POST /api/config');

});

// Increase server timeouts for long-running AI tasks (e.g., image generation)
// 10 minutes = 600,000 ms
server.setTimeout(600000);
server.keepAliveTimeout = 600000;
server.headersTimeout = 601000;
