// Starts the app from app.js: DB first, then the frontend (Vite in dev,
// static dist in production). Kept thin so tests can import app.js alone.
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const app = require('./app');
const connectDB = require('./config/db');

const server = http.createServer(app);
const PORT = process.env.PORT || 6002;

async function startServer() {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be set to a random secret of at least 32 bytes.');
  }

  await connectDB();

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.resolve(__dirname, '../frontend/dist');
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  } else {
    const viteEntry = path.resolve(__dirname, '../frontend/node_modules/vite/dist/node/index.js');
    const { createServer } = await import(pathToFileURL(viteEntry).href);
    const vite = await createServer({
      root: path.resolve(__dirname, '../frontend'),
      configFile: false,
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. LocalKart may already be running at http://localhost:${PORT}.`);
    } else {
      console.error('LocalKart server failed to start:', error.message);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`LocalKart is running at http://localhost:${PORT}`);
  });
}

startServer();
