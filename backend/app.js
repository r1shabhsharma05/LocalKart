// Express app only — no DB connect, no listen. server.js starts it;
// tests import this file and point it at an in-memory MongoDB.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { verifyCsrfToken } = require('./middleware/csrfMiddleware');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const allowedOrigins = new Set(
  (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return origin;
      }
    })
);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://localhost:5174');
  allowedOrigins.add('http://127.0.0.1:5174');
} else {
  const invalidOrigins = [...allowedOrigins].filter((origin) => {
    try {
      const parsedOrigin = new URL(origin);
      return parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin;
    } catch {
      return true;
    }
  });
  if (invalidOrigins.length > 0) {
    throw new Error('Production FRONTEND_URL values must be valid HTTPS origins.');
  }
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'https:', 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: process.env.NODE_ENV === 'production',
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
}));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// commit pins the deployed code: Render sets RENDER_GIT_COMMIT, so a
// live health check proves which deploy is actually serving traffic.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LocalKart backend is running', commit: process.env.RENDER_GIT_COMMIT || 'unknown' });
});

app.use('/api', verifyCsrfToken);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/ai', aiRoutes);

app.use(errorHandler);

module.exports = app;
