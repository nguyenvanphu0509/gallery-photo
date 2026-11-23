import express from 'express';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { httpError } from './errors.js';
import { normalizeAvatar, parseAvatar } from './avatars.js';

const derive = promisify(scrypt);
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const COOKIE = 'habitat_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = `scrypt$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, SCRYPT);
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored || '');
  if (!match) return false;
  const key = await derive(password, match[1], 64, SCRYPT);
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}

function requestToken(req) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export function authenticatedUser(database, req) {
  const token = requestToken(req);
  const user = token ? database.auth.sessionUser(hashToken(token)) : null;
  if (!user) throw httpError(401, 'Vui lòng đăng nhập để sử dụng gallery.');
  return user;
}

export function createAuthRouter({ database, secureCookies = false }) {
  const router = express.Router();
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' };
  const attempts = new Map();
  let hashing = 0;
  let avatarProcessing = false;

  function limit(key, maximum, res) {
    const now = Date.now();
    for (const [entryKey, entry] of attempts) if (entry.until <= now) attempts.delete(entryKey);
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000) throw httpError(429, 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.');
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(key, entry);
    }
    if (++entry.count > maximum) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      throw httpError(429, 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.');
    }
  }

  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    if (!req.is('application/json')) return next(httpError(415, 'Yêu cầu cần có Content-Type application/json.'));
    next();
  });
  router.use(express.json({ limit: '8kb' }));

  function authenticatedUser(req) {
    const token = requestToken(req);
    const user = token ? database.auth.sessionUser(hashToken(token)) : null;
    if (!user) { req.resume(); throw httpError(401, 'Vui lòng đăng nhập lại để thay ảnh đại diện.'); }
    return user;
  }

  router.put('/avatar', async (req, res) => {
    const user = authenticatedUser(req);
    limit(`avatar:${user.id}`, 10, res);
    if (avatarProcessing) { req.resume(); throw httpError(429, 'Đang xử lý ảnh đại diện. Vui lòng thử lại sau.'); }
    avatarProcessing = true;
    try {
      const bytes = await normalizeAvatar(await parseAvatar(req));
      // Check the session again after asynchronous image processing (logout may have happened meanwhile).
      const current = authenticatedUser(req);
      res.json({ user: database.auth.setAvatar(current.id, bytes, randomUUID()) });
    } finally { avatarProcessing = false; }
  });

  router.get('/avatar/:version', (req, res) => {
    const user = authenticatedUser(req);
    const bytes = database.auth.getAvatar(user.id, req.params.version);
    if (!bytes) throw httpError(404, 'Ảnh đại diện không tồn tại.');
    res.set('Cache-Control', 'private, no-store');
    res.type('image/webp').send(Buffer.from(bytes));
  });

  function startSession(req, res, userId, remember, registerUser) {
    const token = randomBytes(32).toString('hex');
    const session = { tokenHash: hashToken(token), userId, expiresAt: Date.now() + (remember ? REMEMBER_MS : SESSION_MS) };
    const previous = requestToken(req);
    const previousHash = previous ? hashToken(previous) : null;
    const user = registerUser
      ? database.auth.register(registerUser, session, previousHash)
      : (database.auth.createSession(session, previousHash), database.auth.sessionUser(session.tokenHash));
    res.cookie(COOKIE, token, { ...cookieOptions, ...(remember ? { maxAge: REMEMBER_MS } : {}) });
    return user;
  }

  for (const action of ['register', 'login']) {
    router.post(`/${action}`, async (req, res) => {
      limit(`ip:${req.ip}`, 30, res);
      const input = req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Dữ liệu tài khoản không hợp lệ.');
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Email không hợp lệ.');
      if (typeof input.password !== 'string' || input.password.length > 128 || input.password.length < (action === 'register' ? 15 : 1)) {
        throw httpError(400, action === 'register' ? 'Mật khẩu cần từ 15 đến 128 ký tự.' : 'Vui lòng nhập mật khẩu hợp lệ.');
      }
      if (input.remember !== undefined && typeof input.remember !== 'boolean') throw httpError(400, 'Lựa chọn ghi nhớ đăng nhập không hợp lệ.');
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (action === 'register') {
        if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw httpError(400, 'Tên cần từ 1 đến 100 ký tự, không chứa ký tự điều khiển.');
        if (input.confirmPassword !== input.password) throw httpError(400, 'Mật khẩu nhập lại chưa khớp.');
      }
      limit(`email:${email}`, 10, res);
      if (hashing >= 2) {
        res.set('Retry-After', '1');
        throw httpError(503, 'Đang xử lý đăng nhập. Vui lòng thử lại sau ít giây.');
      }
      hashing++;
      try {
        const existing = database.auth.findUser(email);
        if (action === 'login') {
          const matches = await verifyPassword(input.password, existing?.password_hash || DUMMY_HASH);
          if (!existing || !matches) throw httpError(401, 'Email hoặc mật khẩu không đúng.');
          const user = startSession(req, res, existing.id, input.remember === true);
          return res.json({ user });
        }
        if (existing) throw httpError(409, 'Email này đã được đăng ký. Vui lòng đăng nhập.');
        const user = { id: randomUUID(), name, email, passwordHash: await hashPassword(input.password), createdAt: new Date().toISOString() };
        // Another request can register this email while the asynchronous hash is running.
        if (database.auth.findUser(email)) throw httpError(409, 'Email này đã được đăng ký. Vui lòng đăng nhập.');
        res.status(201).json({ user: startSession(req, res, user.id, false, user) });
      } finally { hashing--; }
    });
  }

  router.get('/me', (req, res) => {
    const token = requestToken(req);
    const user = token ? database.auth.sessionUser(hashToken(token)) : null;
    if (!user) res.clearCookie(COOKIE, cookieOptions);
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    const token = requestToken(req);
    if (token) database.auth.revokeSession(hashToken(token));
    res.clearCookie(COOKIE, cookieOptions);
    res.status(204).end();
  });
  router.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return next(httpError(400, 'Nội dung JSON không hợp lệ.'));
    if (error.type === 'entity.too.large') return next(httpError(413, 'Dữ liệu tài khoản quá lớn.'));
    next(error);
  });
  return router;
}
