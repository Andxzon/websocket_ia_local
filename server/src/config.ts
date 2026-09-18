import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.error(`❌ Invalid integer for ${name}: ${value}`);
    process.exit(1);
  }
  return parsed;
}

export const config = {
  port: optionalInt('PORT', 3000),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Security
  jwtSecret: requireEnv('JWT_SECRET'),
  adminSecret: requireEnv('ADMIN_SECRET'),
  deviceSecret: requireEnv('DEVICE_SECRET'),

  // CORS
  corsOrigins: optionalEnv('CORS_ORIGINS', '*'),

  // Rate Limiting
  rateLimitWindowMs: optionalInt('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMax: optionalInt('RATE_LIMIT_MAX', 100),

  // Request Timeout
  requestTimeoutMs: optionalInt('REQUEST_TIMEOUT_MS', 120000),

  // Heartbeat
  heartbeatIntervalMs: optionalInt('HEARTBEAT_INTERVAL_MS', 30000),
  heartbeatTimeoutMs: optionalInt('HEARTBEAT_TIMEOUT_MS', 10000),

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
};
