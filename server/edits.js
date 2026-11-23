import sharp from 'sharp';
import { httpError } from './errors.js';
import { limits } from './multipart.js';
import { variantsFromPixels } from './images.js';
import { runCleanup } from './cleanup.js';

export const OLD_VERSION_RETENTION_MS = 24 * 60 * 60 * 1000;

export function validateEdit(input, width, height, restore = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Thông số chỉnh sửa không hợp lệ.');
  const allowed = restore ? ['expectedVersion'] : ['expectedVersion', 'crop', 'rotation', 'flip'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw httpError(400, 'Thông số chỉnh sửa không được hỗ trợ.');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw httpError(400, 'Thiếu phiên bản ảnh đang chỉnh sửa.');
  if (restore) return { crop: { x: 0, y: 0, width, height }, rotation: 0, flip: false };
  if (![0, 90, 180, 270].includes(input.rotation)) throw httpError(400, 'Góc xoay chỉ nhận 0, 90, 180 hoặc 270 độ.');
  if (typeof input.flip !== 'boolean') throw httpError(400, 'Lật ngang cần có giá trị boolean.');
  const crop = input.crop;
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)
    || Object.keys(crop).length !== 4 || !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(crop[key]))
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
    || crop.x + crop.width > width || crop.y + crop.height > height) {
    throw httpError(400, 'Vùng crop phải là hình chữ nhật theo pixel nằm hoàn toàn trong bản gốc.');
  }
  return { crop, rotation: input.rotation, flip: input.flip };
}

// Explicit pipelines fix the order: crop original pixels → rotate clockwise → horizontal flip.
// Sharp applies flop before rotation in one pipeline, so separate stages are necessary.
export async function editPixels(buffer, { crop, rotation, flip }) {
  let pixels = await sharp(buffer, { limitInputPixels: limits.pixels, failOn: 'warning' })
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .raw().toBuffer({ resolveWithObject: true });
  if (rotation) pixels = await sharp(pixels.data, { raw: pixels.info }).rotate(rotation).raw().toBuffer({ resolveWithObject: true });
  if (flip) pixels = await sharp(pixels.data, { raw: pixels.info }).flop().raw().toBuffer({ resolveWithObject: true });
  return pixels;
}

async function readOriginal(storage, key) {
  let object;
  try { object = await storage.get(key); }
  catch { throw httpError(503, 'Không đọc được bản gốc từ kho ảnh. Vui lòng thử lại.'); }
  const maximum = limits.pixels * 4 + 1024 * 1024;
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of object.body) {
      bytes += chunk.length;
      if (bytes > maximum) throw new Error('Original too large');
      chunks.push(chunk);
    }
  } catch { throw httpError(503, 'Bản gốc không đọc được hoặc vượt giới hạn dung lượng.'); }
  return Buffer.concat(chunks);
}

export async function editPhoto(id, input, database, storage, { restore = false, retentionMs = OLD_VERSION_RETENTION_MS } = {}) {
  const photo = database.get(id);
  if (!photo) throw httpError(404, 'Ảnh không tồn tại hoặc đã bị xóa.');
  const original = database.getOriginal(id);
  if (!original) throw httpError(409, 'Ảnh cũ chưa có bản gốc chuẩn hóa. Hãy tải lại ảnh để chỉnh sửa.');
  const parameters = validateEdit(input, original.width, original.height, restore);
  const version = database.reserveVersion(id, input.expectedVersion);
  const buffer = await readOriginal(storage, original.storage_key);
  let variants;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: limits.pixels, failOn: 'warning' }).metadata();
    if (metadata.width !== original.width || metadata.height !== original.height || (metadata.pages || 1) !== 1) throw new Error('Mismatched original');
    variants = await variantsFromPixels(await editPixels(buffer, parameters));
  } catch { throw httpError(503, 'Bản gốc không hợp lệ. Không thay đổi ảnh đang công bố.'); }
  for (const variant of variants) variant.storageKey = `photos/${id}/v${version}/${variant.width}.webp`;
  const keys = variants.map(variant => variant.storageKey);
  try {
    database.stage(id, keys);
    for (const variant of variants) await storage.put(variant.storageKey, variant.buffer);
    return database.publishVersion(id, input.expectedVersion, version, variants, retentionMs);
  } catch (error) {
    try {
      database.releaseKeys(keys);
      await runCleanup(database, storage, id, keys);
    } catch {
      for (const key of keys) {
        try { await storage.remove(key); }
        catch { console.error(JSON.stringify({ event: 'cleanup_required', photoId: id, keys: [key] })); }
      }
    }
    if (error.status) throw error;
    throw httpError(503, 'Không lưu được phiên bản mới. Ảnh đang công bố được giữ nguyên.');
  }
}
