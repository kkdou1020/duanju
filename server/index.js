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
  switch (target) {
    case 'T8_TEXT': return process.env.T8_TEXT_API_KEY || process.env.TEXT_API_KEY;
    case 'T8_IMAGE': return process.env.T8_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
    case 'T8_VIDEO': return process.env.T8_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    case 'T8_AUDIO': return process.env.T8_AUDIO_API_KEY || process.env.AUDIO_API_KEY;
    case 'POLO_TEXT': return process.env.POLO_TEXT_API_KEY || process.env.GEMINI_TEXT_API_KEY || process.env.API_KEY;
    case 'POLO_IMAGE': return process.env.POLO_IMAGE_API_KEY || process.env.GEMINI_IMAGE_API_KEY;
    case 'POLO_VIDEO': return process.env.POLO_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    case 'NANOBANANA': return process.env.NANOBANANA_API_KEY;
    default: return null;
  }
};

const injectAuthHeader = (proxyReq, req) => {
  const keyTarget = req.headers['x-key-target'];
  if (keyTarget) {
    const apiKey = getApiKey(keyTarget);
    if (apiKey) {
      const authValue = apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`;
      proxyReq.setHeader('Authorization', authValue);
    }
    // Remove the helper header before forwarding
    proxyReq.removeHeader('x-key-target');
  }
};

// Proxy for T8Star API
app.use(
  '/api/t8star',
  createProxyMiddleware({
    target: 'https://ai.t8star.org',
    changeOrigin: true,
    secure: false,
    timeout: 300000, // 5 minutes
    proxyTimeout: 300000, // 5 minutes
    pathRewrite: {
      '^/api/t8star': '',
    },
    onProxyReq: (proxyReq, req, res) => {
      injectAuthHeader(proxyReq, req);
      // Log the outgoing request for debugging
      console.log(`[T8Star Proxy] ${req.method} ${req.url} -> ${proxyReq.path}`);
      console.log(`[T8Star Proxy] Authorization header present: ${!!proxyReq.getHeader('Authorization')}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      // Remove Content-Length to force chunked transfer, preventing ERR_CONTENT_LENGTH_MISMATCH
      delete proxyRes.headers['content-length'];

      if (proxyRes.statusCode >= 400) {
        let body = '';
        proxyRes.on('data', (chunk) => { body += chunk.toString(); });
        proxyRes.on('end', () => {
          console.error(`[T8Star Proxy] ERROR ${proxyRes.statusCode} for ${req.method} ${req.url}`);
          console.error(`[T8Star Proxy] Response body: ${body.substring(0, 500)}`);
        });
      }
    },
    onError: (err, req, res) => {
      console.error('Proxy Error (T8Star):', err);
      res.status(500).send('Proxy Error');
    }
  })
);

// Proxy for Polo API
app.use(
  '/api/polo',
  createProxyMiddleware({
    target: 'https://work.poloapi.com',
    changeOrigin: true,
    secure: false,
    pathRewrite: {
      '^/api/polo': '',
    },
    onProxyReq: injectAuthHeader,
    onError: (err, req, res) => {
      console.error('Proxy Error (Polo):', err);
      res.status(500).send('Proxy Error');
    }
  })
);

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
