import { Router, Request, Response } from 'express';
import { adminAuth, createApiKey, listApiKeys, revokeApiKey, deleteApiKey } from '../auth';
import { deviceManager } from '../devices';
import { query } from '../database';
import { adminRateLimiter } from '../middleware';

const router = Router();

// All admin routes require admin secret
router.use(adminAuth);
router.use(adminRateLimiter);

// ============ API Key Management ============

/**
 * POST /admin/api-keys
 * Create a new API key.
 */
router.post('/api-keys', async (req: Request, res: Response) => {
  try {
    const { name, key } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({
        error: { message: 'Name is required.', code: 'invalid_name' },
      });
      return;
    }

    const apiKey = await createApiKey(name, key);

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key, // Only shown once!
      key_prefix: apiKey.key_prefix,
      active: apiKey.active,
      created_at: apiKey.created_at,
      message: '⚠️  Save this key now — it will not be shown again.',
    });
  } catch (err: any) {
    console.error('Error creating API key:', err.message);
    res.status(500).json({ error: { message: 'Failed to create API key.' } });
  }
});

/**
 * GET /admin/api-keys
 * List all API keys.
 */
router.get('/api-keys', async (req: Request, res: Response) => {
  try {
    const keys = await listApiKeys();
    res.json({ data: keys });
  } catch (err: any) {
    console.error('Error listing API keys:', err.message);
    res.status(500).json({ error: { message: 'Failed to list API keys.' } });
  }
});

/**
 * DELETE /admin/api-keys/:id
 * Revoke and delete an API key.
 */
router.delete('/api-keys/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // First revoke, then delete
    await revokeApiKey(id);
    const deleted = await deleteApiKey(id);

    if (!deleted) {
      res.status(404).json({ error: { message: 'API key not found.' } });
      return;
    }

    res.json({ message: 'API key deleted.', id });
  } catch (err: any) {
    console.error('Error deleting API key:', err.message);
    res.status(500).json({ error: { message: 'Failed to delete API key.' } });
  }
});

// ============ Device Management ============

/**
 * GET /admin/devices
 * List all devices (online and offline).
 */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const devices = await deviceManager.getAllDevices();
    res.json({ data: devices });
  } catch (err: any) {
    console.error('Error listing devices:', err.message);
    res.status(500).json({ error: { message: 'Failed to list devices.' } });
  }
});

// ============ Request Statistics ============

/**
 * GET /admin/stats
 * Request statistics.
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Requests today
    const todayResult = await query(
      `SELECT COUNT(*) as count FROM request_logs
       WHERE created_at >= CURRENT_DATE`
    );

    // Average latency today
    const latencyResult = await query(
      `SELECT COALESCE(AVG(latency_ms), 0) as avg_latency FROM request_logs
       WHERE created_at >= CURRENT_DATE AND status = 'completed'`
    );

    // Errors today
    const errorsResult = await query(
      `SELECT COUNT(*) as count FROM request_logs
       WHERE created_at >= CURRENT_DATE AND status = 'error'`
    );

    // Total requests
    const totalResult = await query(
      `SELECT COUNT(*) as count FROM request_logs`
    );

    // Recent requests
    const recentResult = await query(
      `SELECT request_id, device_id, model, status, created_at, latency_ms
       FROM request_logs
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.json({
      requests_today: parseInt(todayResult.rows[0].count),
      avg_latency_ms: Math.round(parseFloat(latencyResult.rows[0].avg_latency)),
      errors_today: parseInt(errorsResult.rows[0].count),
      total_requests: parseInt(totalResult.rows[0].count),
      online_devices: deviceManager.getOnlineCount(),
      recent_requests: recentResult.rows,
    });
  } catch (err: any) {
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: { message: 'Failed to fetch stats.' } });
  }
});

export default router;
