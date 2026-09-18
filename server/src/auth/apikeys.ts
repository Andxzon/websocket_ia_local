import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database';

const SALT_ROUNDS = 12;

export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface ApiKeyWithPlaintext extends ApiKey {
  key: string; // Only available at creation time
}

/**
 * Create a new API key. Returns the full key only once.
 */
export async function createApiKey(name: string, customKey?: string): Promise<ApiKeyWithPlaintext> {
  const plainKey = customKey || `sk-${uuidv4().replace(/-/g, '')}`;
  const keyHash = await bcrypt.hash(plainKey, SALT_ROUNDS);
  const keyPrefix = plainKey.substring(0, Math.min(8, plainKey.length));

  const result = await query<ApiKey>(
    `INSERT INTO api_keys (key_hash, key_prefix, name)
     VALUES ($1, $2, $3)
     RETURNING id, key_prefix, name, active, created_at, revoked_at`,
    [keyHash, keyPrefix, name]
  );

  return {
    ...result.rows[0],
    key: plainKey,
  };
}

/**
 * Validate an API key against stored hashes. Returns the key record if valid.
 */
export async function validateApiKey(plainKey: string): Promise<ApiKey | null> {
  // Get all active keys (for small number of keys this is fine;
  // for large scale, use key_prefix index to narrow down)
  const prefix = plainKey.substring(0, Math.min(8, plainKey.length));

  const result = await query<ApiKey & { key_hash: string }>(
    `SELECT id, key_hash, key_prefix, name, active, created_at, revoked_at
     FROM api_keys
     WHERE active = true AND key_prefix = $1`,
    [prefix]
  );

  for (const row of result.rows) {
    const match = await bcrypt.compare(plainKey, row.key_hash);
    if (match) {
      const { key_hash, ...apiKey } = row;
      return apiKey;
    }
  }

  return null;
}

/**
 * List all API keys (without hashes).
 */
export async function listApiKeys(): Promise<ApiKey[]> {
  const result = await query<ApiKey>(
    `SELECT id, key_prefix, name, active, created_at, revoked_at
     FROM api_keys
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE api_keys
     SET active = false, revoked_at = NOW()
     WHERE id = $1 AND active = true`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete an API key permanently.
 */
export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM api_keys WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
