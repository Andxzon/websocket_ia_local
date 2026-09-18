import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware.
 * Logs method, path, status, and duration.
 * Never logs API keys or prompt content.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Capture original end to log after response
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: any[]): Response {
    const duration = Date.now() - start;
    const logLine = `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`;

    if (res.statusCode >= 500) {
      console.error(`❌ ${logLine}`);
    } else if (res.statusCode >= 400) {
      console.warn(`⚠️  ${logLine}`);
    } else {
      console.log(`✅ ${logLine}`);
    }

    return originalEnd.apply(this, args as any);
  };

  next();
}
