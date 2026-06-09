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

// Zombie process prevention: exit when parent process (Electron) disconnects
if (process.send) {
    process.on('disconnect', () => {
        console.log('[Express] Parent process disconnected. Exiting to prevent zombie process...');
        process.exit(0);
    });
}

// Load environment variables
if (process.env.EXTERNAL_ENV_PATH) {
    const extPath = path.join(process.env.EXTERNAL_ENV_PATH, '.env');
    console.log(`[Express] Loading external env from: ${extPath}`);
    dotenv.config({ path: extPath, override: true });
}
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

// Import business logic routes
import pipelineRouter from './routes/pipeline';
import mediaRouter from './routes/media';
import styleRouter from './routes/style';
import configRouter from './routes/config';
import { getModelManager } from './services/ai/model-manager';

const app = express();
const PORT = process.env.PORT || 3002;

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

// ===== DYNAMIC PROXY AND API KEY MAPPINGS =====
const getApiKey = (target: string) => {
    const mm = getModelManager();
    const providers = mm.getConfig().providers || [];
    for (const provider of providers) {
        const prefix = provider.id === "t8star" ? "T8" : provider.id.toUpperCase();
        if (target.startsWith(`${prefix}_`)) {
            const scope = target.substring(prefix.length + 1); // e.g. 'TEXT', 'IMAGE', 'VIDEO', 'AUDIO'
            const apiKey = process.env[`${prefix}_${scope}_API_KEY`] || process.env[`${prefix}_API_KEY`] || provider.apiKey;
            return apiKey;
        }
    }
    if (target === 'NANOBANANA') return process.env.NANOBANANA_API_KEY;
    return null;
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

// Dynamic Wildcard Proxy: handles /api/proxy/:providerId
app.use(
    '/api/proxy/:providerId',
    (req, res, next) => {
        const providerId = req.params.providerId;
        const mm = getModelManager();
        const providers = mm.getConfig().providers || [];
        const provider = providers.find(p => p.id === providerId);
        if (!provider || !provider.enabled) {
            return res.status(404).send('Provider not found or disabled');
        }

        const target = provider.baseUrl;
        const middleware = createProxyMiddleware({
            target,
            changeOrigin: true,
            secure: false,
            timeout: 300000,
            proxyTimeout: 300000,
            pathRewrite: { [`^/api/proxy/${providerId}`]: '' },
            onProxyReq: (proxyReq, req: any) => {
                injectAuthHeader(proxyReq, req);
                console.log(`[Dynamic Proxy ${provider.name}] ${req.method} ${req.url} -> ${proxyReq.path}`);
            },
            onError: (err, req, res: any) => {
                console.error(`Proxy Error (${providerId}):`, err);
                res.status(500).send('Proxy Error');
            }
        });
        
        return middleware(req, res, next);
    }
);

// Backward-compatible static routes (T8Star and Tutujin)
const registerStaticProxy = (path: string, defaultTarget: string, envPrefix: string) => {
    return createProxyMiddleware({
        target: process.env[`${envPrefix}_BASE_URL`] || defaultTarget,
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
        pathRewrite: { [`^${path}`]: '' },
        onProxyReq: (proxyReq, req: any) => {
            injectAuthHeader(proxyReq, req);
            console.log(`[Proxy ${envPrefix}] ${req.method} ${req.url} -> ${proxyReq.path}`);
        },
        onError: (err, req, res: any) => {
            console.error(`Proxy Error (${envPrefix}):`, err);
            res.status(500).send('Proxy Error');
        }
    });
};

app.use('/api/t8star', registerStaticProxy('/api/t8star', 'https://ai.t8star.org', 'T8'));
app.use('/api/tutujin', registerStaticProxy('/api/tutujin', 'https://api.tutujin.com/v1', 'TUTUJIN'));

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
