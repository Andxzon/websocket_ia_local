import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiter for API endpoints.
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests. Please try again later.',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  },
  keyGenerator: (req) => {
    // Use API key prefix if available, otherwise IP
    return req.apiKey?.key_prefix || req.ip || 'unknown';
  },
});

/**
 * Stricter rate limiter for admin endpoints.
 */
export const adminRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many admin requests.',
      type: 'rate_limit_error',
      code: 'admin_rate_limit_exceeded',
    },
  },
});
