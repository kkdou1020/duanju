const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
// Also load from local .env if exists
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// CORS: restrict in production, allow all in dev
if (process.env.NODE_ENV === 'production') {
  app.use(cors({ origin: false })); // same-origin only
} else {
  app.use(cors());
}

// Simple in-memory rate limiter (no extra dependency)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window per IP

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
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

// Helper to get API key from environment
const getApiKey = (target) => {
  try {
    const { getModelManager } = require('./dist/services/ai/model-manager');
    const mm = getModelManager();
    const providers = mm.getConfig().providers || [];
    for (const provider of providers) {
      const prefix = provider.id === "t8star" ? "T8" : provider.id.toUpperCase();
      if (target.startsWith(`${prefix}_`)) {
        const scope = target.substring(prefix.length + 1);
        const apiKey = process.env[`${prefix}_${scope}_API_KEY`] || process.env[`${prefix}_API_KEY`] || provider.apiKey;
        return apiKey;
      }
    }
  } catch (e) {
    if (target.startsWith('T8_')) {
      const scope = target.substring(3);
      return process.env[`T8_${scope}_API_KEY`] || process.env.T8_API_KEY || process.env.API_KEY;
    }
    if (target.startsWith('TUTUJIN_')) {
      const scope = target.substring(8);
      return process.env[`TUTUJIN_${scope}_API_KEY`] || process.env.TUTUJIN_API_KEY;
    }
  }
  if (target === 'NANOBANANA') return process.env.NANOBANANA_API_KEY;
  return null;
};

const injectAuthHeader = (proxyReq, req) => {
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
    try {
      const { getModelManager } = require('./dist/services/ai/model-manager');
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
        onProxyReq: (proxyReq, req) => {
          injectAuthHeader(proxyReq, req);
          console.log(`[Dynamic Proxy ${provider.name}] ${req.method} ${req.url} -> ${proxyReq.path}`);
        },
        onError: (err, req, res) => {
          console.error(`Proxy Error (${providerId}):`, err);
          res.status(500).send('Proxy Error');
        }
      });
      return middleware(req, res, next);
    } catch (e) {
      return res.status(500).send('Proxy manager not built');
    }
  }
);

// Backward-compatible static routes (T8Star and Tutujin)
const registerStaticProxy = (path, defaultTarget, envPrefix) => {
  return createProxyMiddleware({
    target: process.env[`${envPrefix}_BASE_URL`] || defaultTarget,
    changeOrigin: true,
    secure: false,
    timeout: 300000,
    proxyTimeout: 300000,
    pathRewrite: { [`^${path}`]: '' },
    onProxyReq: (proxyReq, req) => {
      injectAuthHeader(proxyReq, req);
      console.log(`[Proxy ${envPrefix}] ${req.method} ${req.url} -> ${proxyReq.path}`);
    },
    onError: (err, req, res) => {
      console.error(`Proxy Error (${envPrefix}):`, err);
      res.status(500).send('Proxy Error');
    }
  });
};

app.use('/api/t8star', registerStaticProxy('/api/t8star', 'https://ai.t8star.org', 'T8'));
app.use('/api/tutujin', registerStaticProxy('/api/tutujin', 'https://api.tutujin.com/v1', 'TUTUJIN'));

// Serve static files from the frontend build directory
// Assuming the frontend is built to ../dist
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Handle client-side routing, return all requests to index.html
app.get('*', (req, res) => {
  // Check if file exists, if not send index.html
  if (req.accepts('html')) {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) {
        // If index.html doesn't exist (e.g. not built yet), send a message
        res.status(404).send('Frontend not built. Please run "npm run build" in the root directory.');
      }
    });
  } else {
    res.status(404).send('Not Found');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
