import sharp from 'sharp';
import { limits } from './multipart.js';

export async function normalizeUpload(buffer) {
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (!png && !jpeg) throw new Error('Chỉ chấp nhận nội dung JPEG hoặc PNG.');
  // failOn warning also rejects truncated files that a tolerant decoder could display.
  const source = sharp(buffer, { limitInputPixels: limits.pixels, failOn: 'warning' });
  const metadata = await source.metadata();
  if (!['jpeg', 'png'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Ảnh phải là JPEG hoặc PNG tĩnh.');
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > limits.pixels) throw new Error('Ảnh tối đa 40 triệu pixel.');
  // Decode once and physically rotate pixels before stripping EXIF. Sharp strips metadata by default.
  return source.autoOrient().raw().toBuffer({ resolveWithObject: true });
}

export async function variantsFromPixels(normalized) {
  const widths = [...new Set([320, 960, 1600].map(w => Math.min(w, normalized.info.width)))];
  const variants = [];
  for (const width of widths) {
    const result = await sharp(normalized.data, { raw: normalized.info })
      .resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    variants.push({ width: result.info.width, height: result.info.height, mime: 'image/webp', bytes: result.data.length, buffer: result.data });
  }
  return variants;
}

export async function createVariants(buffer) {
  return variantsFromPixels(await normalizeUpload(buffer));
}

export async function prepareUpload(buffer) {
  const normalized = await normalizeUpload(buffer);
  const original = {
    buffer: await sharp(normalized.data, { raw: normalized.info }).png().toBuffer(),
    width: normalized.info.width, height: normalized.info.height,
  };
  return { original, variants: await variantsFromPixels(normalized) };
}
