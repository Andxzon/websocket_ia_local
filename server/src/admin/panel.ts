import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * GET /panel
 * Serves the admin panel HTML.
 * Tries multiple paths to work both locally and on Render.
 */
router.get('/', (req: Request, res: Response) => {
  // Priority 1: dist/admin/index.html (copied during build, right next to compiled JS)
  const distAdminPath = path.resolve(__dirname, '../admin/index.html');

  // Priority 2: source admin/ at repo root (for local ts-node dev)
  const srcAdminPath = path.resolve(__dirname, '../../../../admin/index.html');

  // Priority 3: relative to cwd
  const cwdPath = path.resolve(process.cwd(), 'dist/admin/index.html');

  const candidates = [distAdminPath, srcAdminPath, cwdPath];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      res.sendFile(candidate);
      return;
    }
  }

  res.status(404).json({
    error: {
      message: 'Admin panel not found.',
      checkedPaths: candidates,
    },
  });
});

export default router;
