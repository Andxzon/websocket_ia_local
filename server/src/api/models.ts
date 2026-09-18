import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../auth';
import { deviceManager } from '../devices';

const router = Router();

/**
 * GET /v1/models
 * OpenAI-compatible models listing.
 */
router.get('/v1/models', apiKeyAuth, (req: Request, res: Response) => {
  const models = deviceManager.getAvailableModels();

  // If no devices connected, still return default model
  const modelList = models.length > 0 ? models : ['qwen'];

  const data = modelList.map((modelId) => ({
    id: modelId,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'local',
    permission: [],
    root: modelId,
    parent: null,
  }));

  res.json({
    object: 'list',
    data,
  });
});

export default router;
