import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * GET /admin
 * Serves the admin panel HTML.
 */
router.get('/', (req: Request, res: Response) => {
  // Serve inline HTML or static file
  const htmlPath = path.resolve(__dirname, '../../admin/index.html');

  // Try serving from admin/ directory first
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
    return;
  }

  // Fallback: check relative to project root
  const fallbackPath = path.resolve(__dirname, '../../../admin/index.html');
  if (fs.existsSync(fallbackPath)) {
    res.sendFile(fallbackPath);
    return;
  }

  res.status(404).json({ error: { message: 'Admin panel not found.' } });
});

export default router;
