import fs from 'fs';
import path from 'path';
import { query } from './connection';

export async function runMigrations(): Promise<void> {
  console.log('🗄️  Running database migrations...');

  const schemaPath = path.resolve(__dirname, 'schema.sql');

  // In production (compiled), the SQL file is not in dist/, so we check both locations
  let sqlContent: string;
  if (fs.existsSync(schemaPath)) {
    sqlContent = fs.readFileSync(schemaPath, 'utf-8');
  } else {
    // Fallback: look in src directory relative to project root
    const fallbackPath = path.resolve(__dirname, '../../src/database/schema.sql');
    if (fs.existsSync(fallbackPath)) {
      sqlContent = fs.readFileSync(fallbackPath, 'utf-8');
    } else {
      // Inline schema as last resort
      sqlContent = getInlineSchema();
    }
  }

  try {
    await query(sqlContent);
    console.log('✅ Database migrations completed.');
  } catch (error: any) {
    console.error('❌ Migration error:', error.message);
    throw error;
  }
}

function getInlineSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (active) WHERE active = true;
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Unknown Device',
      model TEXT NOT NULL DEFAULT 'qwen',
      status TEXT NOT NULL DEFAULT 'offline',
      last_seen TIMESTAMP WITH TIME ZONE,
      connected_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

    CREATE TABLE IF NOT EXISTS request_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id TEXT NOT NULL UNIQUE,
      device_id TEXT,
      api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tokens_in INTEGER,
      tokens_out INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      latency_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs (created_at);
    CREATE INDEX IF NOT EXISTS idx_request_logs_device_id ON request_logs (device_id);
    CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs (status);
  `;
}
