import Busboy from 'busboy';
import { httpError } from './errors.js';

export const limits = { fileBytes: 10 * 1024 * 1024, requestBytes: 55 * 1024 * 1024, files: 5, pixels: 40_000_000 };

// No temporary files: retain at most 5 × 10 MiB, and drain rejected file streams.
// Crucially, storage writes start only AFTER the entire multipart request is valid.
export function parseUpload(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > limits.requestBytes) {
      req.resume();
      return reject(httpError(413, 'Toàn request tối đa 55 MiB.'));
    }
    let parser;
    try {
      parser = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: {
        files: limits.files, fileSize: limits.fileBytes + 1, fields: 2, parts: 8,
        fieldSize: 4096, fieldNameSize: 100,
      } });
    } catch { req.resume(); return reject(httpError(400, 'Cần multipart/form-data có boundary hợp lệ.')); }
    const files = [], fields = {};
    let total = 0, requestError, settled = false;
    const invalid = message => { requestError ||= httpError(400, message); };
    function detach() { req.off('data', count); req.off('aborted', aborted); req.off('error', aborted); }
    function fail(error) {
      if (settled) return;
      settled = true;
      detach();
      req.unpipe(parser);
      parser.destroy();
      req.resume();
      reject(error);
    }
    function count(chunk) {
      total += chunk.length;
      if (total > limits.requestBytes) fail(httpError(413, 'Toàn request tối đa 55 MiB.'));
    }
    function aborted() { fail(httpError(400, 'Request bị gián đoạn.')); }
    req.on('data', count);
    req.on('aborted', aborted);
    req.on('error', aborted);
    parser.on('field', (name, value, info) => {
      if (!['title', 'alt'].includes(name) || Object.hasOwn(fields, name) || info.valueTruncated || info.nameTruncated) {
        return invalid('Chỉ nhận title và alt, mỗi trường một lần.');
      }
      fields[name] = value.trim();
    });
    parser.on('file', (name, stream, info) => {
      const file = { index: files.length, name: info.filename || 'unnamed', buffer: null, error: null };
      files.push(file);
      if (name !== 'photos') invalid('Tên trường file phải là photos.');
      let chunks = [], bytes = 0;
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > limits.fileBytes) {
          file.error = { code: 'FILE_TOO_LARGE', message: 'Mỗi file tối đa 10 MiB.' };
          chunks = [];
        } else if (!file.error) chunks.push(chunk);
      });
      stream.on('error', () => invalid('Multipart không hoàn chỉnh.'));
      stream.on('end', () => { if (!file.error) file.buffer = Buffer.concat(chunks); });
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => invalid('Nhận 1–5 file và hai trường title, alt.'));
    parser.on('error', () => fail(httpError(400, 'Multipart không hoàn chỉnh.')));
    parser.on('close', () => {
      if (settled) return;
      settled = true;
      detach();
      if (requestError) return reject(requestError);
      if (!files.length) return reject(httpError(400, 'Chọn từ 1 đến 5 ảnh.'));
      if (!fields.title || fields.title.length > 200 || !fields.alt || fields.alt.length > 500) {
        return reject(httpError(400, 'Title bắt buộc, tối đa 200 ký tự; alt bắt buộc, tối đa 500 ký tự.'));
      }
      resolve({ files, title: fields.title, alt: fields.alt });
    });
    req.pipe(parser);
  });
}
