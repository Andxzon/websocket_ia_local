import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';

import { config } from './config';
import { runMigrations } from './database';
import { createWebSocketHandler, createVoiceWebSocketHandler } from './websocket';
import { chatRouter, modelsRouter, adminRouter, healthRouter } from './api';
import { securityMiddleware, requestLogger } from './middleware';
import adminPanelRouter from './admin/panel';
import { createApiKey, listApiKeys } from './auth';

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════╗
║         LocalAI Bridge v1.0         ║
║   OpenAI-compatible AI Bridge       ║
╚══════════════════════════════════════╝
  `);

  // Run database migrations
  await runMigrations();

  // Create Express app
  const app = express();

  // Security middleware
  const middlewares = securityMiddleware();
  for (const mw of middlewares) {
    app.use(mw);
  }

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use(chatRouter);
  app.use(modelsRouter);
  app.use('/admin', adminRouter);
  app.use(healthRouter);

  // Admin panel (HTML)
  app.use('/panel', adminPanelRouter);

  // 404 handler
  app.use((req: express.Request, res: express.Response) => {
    res.status(404).json({
      error: {
        message: `Route not found: ${req.method} ${req.path}`,
        type: 'not_found',
        code: 'route_not_found',
      },
    });
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({
      error: {
        message: 'Internal server error.',
        type: 'server_error',
        code: 'internal_error',
      },
    });
  });

  // Create HTTP server
  const server = http.createServer(app);

  // Create WebSocket server on /device path
  const wss = new WebSocketServer({ noServer: true });
  createWebSocketHandler(wss);

  // Create WebSocket server on /client-voice path
  const voiceWss = new WebSocketServer({ noServer: true });
  createVoiceWebSocketHandler(voiceWss);

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const url = parseUrl(request.url || '', true);

    if (url.pathname === '/device') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (url.pathname === '/client-voice') {
      voiceWss.handleUpgrade(request, socket, head, (ws) => {
        voiceWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Seed initial API key if none exist
  await seedApiKey();

  // Start server
  server.listen(config.port, () => {
    console.log(`🚀 Server listening on port ${config.port}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${config.port}/device`);
    console.log(`🌐 API endpoint: http://localhost:${config.port}/v1`);
    console.log(`🔧 Admin panel: http://localhost:${config.port}/panel`);
    console.log(`❤️  Health check: http://localhost:${config.port}/health`);
    console.log('');
    console.log('Waiting for device connections...');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    wss.close();
    server.close();
    const { closePool } = await import('./database/connection');
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Create default API key "andxzon" if no keys exist.
 */
async function seedApiKey(): Promise<void> {
  try {
    const existing = await listApiKeys();
    if (existing.length === 0) {
      const key = await createApiKey('default', 'andxzon');
      console.log(`🔑 Default API key created: ${key.key}`);
      console.log('   ⚠️  Change this in production!');
    }
  } catch (err: any) {
    console.warn('Could not seed API key:', err.message);
  }
}

// Start
main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
