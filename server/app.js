import express from 'express';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { parseUpload } from './multipart.js';
import { uploadPhotos } from './photos.js';
import { runCleanup } from './cleanup.js';
import { httpError } from './errors.js';
import { createAuthRouter, authenticatedUser } from './auth.js';
import { editPhoto } from './edits.js';

export function createApp({ database, storage, production = false, developmentOrigin = 'http://127.0.0.1:5173', secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      let foreignOrigin = false;
      try {
        foreignOrigin = Boolean(origin && new URL(origin).host !== req.get('host')
          && (production || origin !== developmentOrigin));
      }
      catch { foreignOrigin = true; }
      if (req.get('sec-fetch-site') === 'cross-site' || foreignOrigin) return next(httpError(403, 'Yêu cầu khác nguồn không được phép.'));
    }
    next();
  });
  app.use('/api/auth', createAuthRouter({ database, secureCookies }));
  // Reject overlapping uploads rather than multiplying the bounded 50 MiB buffer.
  let uploading = false;
  const editJson = [
    (req, res, next) => req.is('application/json') ? next() : next(httpError(415, 'Cần Content-Type application/json.')),
    express.json({ limit: '4kb' }),
  ];
  for (const action of ['edit', 'restore']) app.post(`/api/photos/:id/${action}`, ...editJson, async (req, res) => {
    const user = authenticatedUser(database, req);
    if (!database.ownedBy(req.params.id, user.id)) throw httpError(404, 'Ảnh không tồn tại trong tài khoản của bạn.');
    if (uploading) throw httpError(429, 'Đang xử lý ảnh. Vui lòng thử lại sau.');
    uploading = true;
    try {
      res.json({ photo: await editPhoto(req.params.id, req.body, database, storage, { restore: action === 'restore' }) });
    } finally { uploading = false; }
  });
  app.post('/api/photos', async (req, res) => {
    const user = authenticatedUser(database, req);
    if (uploading) { req.resume(); throw httpError(429, 'Đang xử lý một lượt upload. Hãy thử lại sau.'); }
    uploading = true;
    try {
      const input = await parseUpload(req);
      res.json(await uploadPhotos({ ...input, userId: user.id }, database, storage));
    } finally { uploading = false; }
  });
  app.get('/api/health', async (req, res) => {
    try { await storage.check(); res.json({ storage: 'connected', service: 'SeaweedFS' }); }
    catch { res.status(503).json({ storage: 'disconnected', message: 'Chưa kết nối SeaweedFS. Chạy npm run storage:up.' }); }
  });
  app.get('/api/presets/hidden', (req, res) => {
    const user = authenticatedUser(database, req);
    res.json({ presetIds: database.hiddenPresets(user.id) });
  });
  app.put('/api/presets/:presetId/hidden', express.json({ limit: '1kb' }), (req, res) => {
    const user = authenticatedUser(database, req);
    if (!/^preset-[1-5]$/.test(req.params.presetId)) throw httpError(400, 'Preset không hợp lệ.');
    database.hidePreset(user.id, req.params.presetId);
    res.json({ presetIds: database.hiddenPresets(user.id) });
  });
  app.get('/api/photos', (req, res) => {
    const user = authenticatedUser(database, req);
    res.json({ photos: database.list(user.id) });
  });
  app.get('/api/photos/:id', (req, res) => {
    const user = authenticatedUser(database, req);
    if (!database.ownedBy(req.params.id, user.id)) throw httpError(404, 'Ảnh không tồn tại trong tài khoản của bạn.');
    const photo = database.get(req.params.id);
    if (!photo) throw httpError(404, 'Ảnh không tồn tại hoặc đã bị ẩn.');
    res.json({ photo });
  });
  app.delete('/api/photos/:id', async (req, res) => {
    const user = authenticatedUser(database, req);
    if (!database.ownedBy(req.params.id, user.id)) throw httpError(404, 'Ảnh không tồn tại trong tài khoản của bạn.');
    if (!database.markDeleting(req.params.id)) throw httpError(404, 'Ảnh không tồn tại.');
    const result = await runCleanup(database, storage, req.params.id);
    if (result.failed) return res.status(202).json({ message: 'Đã ẩn ảnh. File đang chờ dọn; chạy npm run cleanup để thử lại.' });
    res.status(204).end();
  });
  async function serveImage(req, res) {
    const user = authenticatedUser(database, req);
    if (!database.ownedBy(req.params.id, user.id)) throw httpError(404, 'Ảnh không tồn tại trong tài khoản của bạn.');
    const original = req.params.filename === 'original.png' && !req.params.version;
    const match = /^(\d+)\.webp$/.exec(req.params.filename);
    const version = req.params.version ? /^v([1-9]\d*)$/.exec(req.params.version) : null;
    const variant = original ? database.getOriginal(req.params.id)
      : match && (!req.params.version || version) && database.getVariant(req.params.id, Number(match[1]), version ? Number(version[1]) : 1);
    if (!variant) throw httpError(404, 'Variant không tồn tại.');
    let object;
    try { object = await storage.get(variant.storage_key); }
    catch { throw httpError(503, 'Không đọc được ảnh từ SeaweedFS.'); }
    res.type(variant.mime || 'image/webp');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Length', String(object.length));
    try { await pipeline(object.body, res); }
    catch { res.destroy(); }
  }
  app.get('/media/photos/:id/:version/:filename', serveImage);
  app.get('/media/photos/:id/:filename', serveImage);
  app.use(['/api', '/media'], (req, res) => res.status(404).json({ message: 'Đường dẫn không tồn tại.' }));
  if (production) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.set('Cache-Control', 'no-store');
    res.status(status).json({ message: status === 500 ? 'Có lỗi xảy ra trên server.' : error.message });
  });
  return app;
}
