import cors from 'cors';
import helmet from 'helmet';
import express, { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Security middleware stack.
 */
export function securityMiddleware() {
  return [
    // Helmet (basic security headers) — allow inline scripts for admin panel
    helmet({
      contentSecurityPolicy: false,
    }),

    // CORS
    cors({
      origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(',').map(s => s.trim()),
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
      credentials: true,
    }),

    // Body size limit (1MB)
    express.json({ limit: '1mb' }),

    // JSON parse error handler
    ((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.type === 'entity.parse.failed') {
        res.status(400).json({
          error: {
            message: 'Invalid JSON in request body.',
            type: 'invalid_request_error',
            code: 'invalid_json',
          },
        });
        return;
      }
      if (err.type === 'entity.too.large') {
        res.status(413).json({
          error: {
            message: 'Request body too large. Maximum size is 1MB.',
            type: 'invalid_request_error',
            code: 'request_too_large',
          },
        });
        return;
      }
      next(err);
    }) as express.ErrorRequestHandler,
  ];
}
