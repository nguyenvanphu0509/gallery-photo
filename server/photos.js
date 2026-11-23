import { randomUUID } from 'node:crypto';
import { prepareUpload } from './images.js';
import { runCleanup } from './cleanup.js';

export async function uploadPhotos(input, database, storage) {
  const results = [];
  for (const file of input.files) {
    const result = { index: file.index, name: file.name };
    if (file.error) { results.push({ ...result, status: 'rejected', error: file.error }); continue; }
    let variants, original;
    try { ({ variants, original } = await prepareUpload(file.buffer)); }
    catch (error) {
      results.push({ ...result, status: 'rejected', error: { code: 'INVALID_IMAGE', message: 'Ảnh hỏng, không đúng JPEG/PNG tĩnh hoặc vượt 40 triệu pixel.' } });
      file.buffer = null;
      continue;
    }
    file.buffer = null;
    const id = randomUUID();
    original.storageKey = `photos/${id}/original.png`;
    for (const variant of variants) variant.storageKey = `photos/${id}/v1/${variant.width}.webp`;
    const keys = [original.storageKey, ...variants.map(v => v.storageKey)];
    try {
      database.stage(id, keys);
      await storage.put(original.storageKey, original.buffer, 'image/png');
      original.buffer = null;
      for (const variant of variants) await storage.put(variant.storageKey, variant.buffer);
      const photo = database.publish({ id, title: input.title, alt: input.alt, createdAt: new Date().toISOString(), userId: input.userId }, variants, original);
      results.push({ ...result, status: 'accepted', photo });
    } catch (error) {
      console.error(JSON.stringify({ event: 'upload_failed', photoId: id, message: error.message }));
      try {
        database.release(id);
        await runCleanup(database, storage, id);
      } catch {
        // Emergency compensation if the metadata DB itself is unavailable.
        const failedKeys = [];
        for (const key of keys) { try { await storage.remove(key); } catch { failedKeys.push(key); } }
        console.error(JSON.stringify({ event: 'cleanup_required', photoId: id, keys: failedKeys, stagedKeys: keys }));
      }
      results.push({ ...result, status: 'rejected', error: { code: 'SAVE_FAILED', message: 'Không lưu được ảnh. Kiểm tra storage/database rồi thử lại.' } });
    }
  }
  return { results };
}
