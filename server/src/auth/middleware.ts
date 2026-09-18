import { Request, Response, NextFunction } from 'express';
import { validateApiKey, ApiKey } from './apikeys';
import { config } from '../config';

// Extend Express Request to include authenticated API key
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

/**
 * Middleware: Validates Bearer token against stored API key hashes.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    res.status(401).json({
      error: {
        message: 'Missing Authorization header. Use: Authorization: Bearer <api-key>',
        type: 'authentication_error',
        code: 'missing_api_key',
      },
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: {
        message: 'Invalid Authorization format. Use: Authorization: Bearer <api-key>',
        type: 'authentication_error',
        code: 'invalid_format',
      },
    });
    return;
  }

  const token = parts[1];

  validateApiKey(token)
    .then((apiKey) => {
      if (!apiKey) {
        res.status(401).json({
          error: {
            message: 'Invalid API key.',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        });
        return;
      }

      req.apiKey = apiKey;
      next();
    })
    .catch((err) => {
      console.error('Auth error:', err.message);
      res.status(500).json({
        error: {
          message: 'Authentication service error.',
          type: 'server_error',
          code: 'auth_error',
        },
      });
    });
}

/**
 * Middleware: Validates admin secret from X-Admin-Secret header.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = req.headers['x-admin-secret'] as string;

  if (!adminSecret || adminSecret !== config.adminSecret) {
    res.status(403).json({
      error: {
        message: 'Invalid or missing admin secret.',
        type: 'authentication_error',
        code: 'invalid_admin_secret',
      },
    });
    return;
  }

  next();
}
