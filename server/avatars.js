import Busboy from 'busboy';
import sharp from 'sharp';
import { httpError } from './errors.js';

export const AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const REQUEST_BYTES = AVATAR_FILE_BYTES + 64 * 1024;
const MAX_PIXELS = 16_000_000;

export function parseAvatar(req) {
  return new Promise((resolve, reject) => {
    if (!req.is('multipart/form-data')) { req.resume(); return reject(httpError(415, 'Cần gửi ảnh đại diện bằng multipart/form-data.')); }
    if (Number(req.headers['content-length']) > REQUEST_BYTES) { req.resume(); return reject(httpError(413, 'Ảnh đại diện tối đa 5 MiB.')); }
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 0, parts: 2, fileSize: AVATAR_FILE_BYTES + 1 } }); }
    catch { req.resume(); return reject(httpError(400, 'Dữ liệu ảnh đại diện không hợp lệ.')); }
    let total = 0, fileBytes = 0, fileCount = 0, failure, settled = false;
    let chunks = [];
    const invalid = message => { failure ||= httpError(400, message); chunks = []; };
    function detach() { req.off('data', count); req.off('aborted', aborted); req.off('error', aborted); }
    function fail(error) {
      if (settled) return;
      settled = true; detach(); req.unpipe(parser); parser.destroy(); req.resume(); reject(error);
    }
    function count(chunk) { total += chunk.length; if (total > REQUEST_BYTES) fail(httpError(413, 'Ảnh đại diện tối đa 5 MiB.')); }
    function aborted() { fail(httpError(400, 'Tải ảnh đại diện bị gián đoạn.')); }
    req.on('data', count); req.on('aborted', aborted); req.on('error', aborted);
    parser.on('field', () => invalid('Chỉ gửi một file trong trường avatar.'));
    parser.on('file', (name, stream) => {
      fileCount++;
      if (name !== 'avatar') invalid('Tên trường file phải là avatar.');
      stream.on('data', chunk => {
        fileBytes += chunk.length;
        if (fileBytes > AVATAR_FILE_BYTES) { failure = httpError(413, 'Ảnh đại diện tối đa 5 MiB.'); chunks = []; }
        else if (!failure) chunks.push(chunk);
      });
      stream.on('error', () => invalid('File ảnh đại diện bị gián đoạn.'));
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => invalid('Chỉ gửi một file ảnh đại diện.'));
    parser.on('error', () => fail(httpError(400, 'Dữ liệu ảnh đại diện không hoàn chỉnh.')));
    parser.on('close', () => {
      if (settled) return;
      settled = true; detach();
      if (failure) return reject(failure);
      if (fileCount !== 1 || !fileBytes) return reject(httpError(400, 'Vui lòng chọn một ảnh đại diện.'));
      resolve(Buffer.concat(chunks));
    });
    req.pipe(parser);
  });
}

export async function normalizeAvatar(buffer) {
  try {
    const source = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    const result = await source.autoOrient().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toBuffer();
    if (result.length > 128 * 1024) throw new Error('Avatar output too large');
    return result;
  } catch {
    throw httpError(400, 'Chọn ảnh JPG, PNG hoặc WebP tĩnh, không hỏng và tối đa 16 triệu pixel.');
  }
}
