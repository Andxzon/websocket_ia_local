import { Router, Request, Response } from 'express';
import { requestQueue } from '../requests';
import { deviceManager } from '../devices';

const router = Router();

/**
 * GET /health
 * Health check endpoint.
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    online_devices: deviceManager.getOnlineCount(),
    pending_requests: requestQueue.getPendingCount(),
  });
});

export default router;
