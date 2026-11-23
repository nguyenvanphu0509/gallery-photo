import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { hashToken } from './auth.js';
import sharp from 'sharp';
import { AVATAR_FILE_BYTES } from './avatars.js';

const PASSWORD = 'A long test password 123!';
const account = (overrides = {}) => ({ name: 'Người dùng thử', email: 'tester@example.com', password: PASSWORD, confirmPassword: PASSWORD, ...overrides });
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

async function setup(t, options = {}) {
  const database = createDatabase(options.filename || ':memory:');
  const server = createApp({ database, storage: { async check() {} }, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); database.close(); });
  return {
    database,
    async post(path, data, cookie, headers = {}) {
      return fetch(`${url}/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(data) });
    },
    async me(cookie) {
      const response = await fetch(`${url}/api/auth/me`, { headers: cookie ? { Cookie: cookie } : {} });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    },
    url,
  };
}

test('register normalizes email, hashes passwords with distinct salts, and returns a safe user plus HttpOnly session', async t => {
  const { database, post, me } = await setup(t);
  const response = await post('/register', account({ name: '  Linh  ', email: '  TESTER@Example.COM  ' }));
  assert.equal(response.status, 201);
  const { user } = await response.json();
  assert.deepEqual(Object.keys(user).sort(), ['avatarUrl', 'createdAt', 'email', 'id', 'name']);
  assert.equal(user.avatarUrl, null);
  assert.equal(user.email, 'tester@example.com');
  assert.equal(user.name, 'Linh');
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.doesNotMatch(header, /Max-Age/);
  assert.deepEqual(await me(cookieOf(response)), { user });
  const stored = database.auth.findUser('tester@example.com');
  assert.match(stored.password_hash, /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.ok(!stored.password_hash.includes(PASSWORD));
  const second = await post('/register', account({ email: 'other@example.com' }));
  assert.equal(second.status, 201);
  assert.notEqual(stored.password_hash, database.auth.findUser('other@example.com').password_hash);
  assert.equal((await post('/register', account({ email: 'TESTER@EXAMPLE.COM' }))).status, 409);
});

test('login rejects wrong and unknown accounts consistently; rotates session, remembers login, and logout revokes it', async t => {
  const { post, me } = await setup(t);
  const registered = await post('/register', account());
  const original = cookieOf(registered);
  const wrong = await post('/login', { email: 'tester@example.com', password: 'wrong-password' });
  const unknown = await post('/login', { email: 'nobody@example.com', password: PASSWORD });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(wrong.headers.get('set-cookie'), null);
  const response = await post('/login', { email: 'TESTER@example.com', password: PASSWORD, remember: true }, original);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=2592000/);
  const current = cookieOf(response);
  assert.notEqual(current, original);
  assert.deepEqual(await me(original), { user: null });
  assert.equal((await me(current)).user.email, 'tester@example.com');
  const logout = await post('/logout', {}, current);
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.deepEqual(await me(current), { user: null });
  assert.equal((await post('/logout', {}, current)).status, 204);
  const temporary = await post('/login', { email: 'tester@example.com', password: PASSWORD, remember: false });
  assert.equal(temporary.status, 200);
  assert.doesNotMatch(temporary.headers.get('set-cookie'), /Max-Age/);
});

test('invalid registration is rejected on the server and does not create users', async t => {
  const { database, post } = await setup(t);
  for (const overrides of [
    { name: '' }, { name: 'x'.repeat(101) }, { name: 'a\u0000b' }, { email: 'invalid' },
    { password: 'short', confirmPassword: 'short' }, { password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
    { confirmPassword: 'mismatch' }, { password: 42 }, { remember: 'yes' },
  ]) {
    const response = await post('/register', account(overrides));
    assert.equal(response.status, 400, JSON.stringify(overrides));
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(database.auth.findUser('tester@example.com'), undefined);
});

test('session lookup rejects missing, malformed, unknown, and expired tokens', async t => {
  const { database, post, me } = await setup(t);
  const response = await post('/register', account());
  const { user } = await response.json();
  const token = 'a'.repeat(64);
  database.auth.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() - 1 });
  for (const cookie of [undefined, 'habitat_session=garbage', `habitat_session=${'b'.repeat(64)}`, `habitat_session=${token}`]) {
    assert.deepEqual(await me(cookie), { user: null });
  }
});

test('users and hashed sessions survive reopening SQLite and never persist the raw session token', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'habitat-auth-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'gallery.sqlite');
  let savedCookie;
  await t.test('create account', async child => {
    const { post } = await setup(child, { filename });
    const response = await post('/register', account());
    assert.equal(response.status, 201);
    savedCookie = cookieOf(response);
  });
  const raw = new DatabaseSync(filename);
  try {
    const rows = raw.prepare('SELECT * FROM UserSession').all();
    assert.equal(rows.length, 1);
    const token = savedCookie.split('=')[1];
    assert.equal(rows[0].token_hash, hashToken(token));
    assert.notEqual(rows[0].token_hash, token);
  } finally { raw.close(); }
  await t.test('reopen account and session', async child => {
    const { post, me } = await setup(child, { filename });
    assert.equal((await me(savedCookie)).user.email, 'tester@example.com');
    assert.equal((await post('/login', { email: 'tester@example.com', password: PASSWORD })).status, 200);
  });
});

test('auth requires JSON, bounds request size, and rejects cross-site writes including logout', async t => {
  const { url, post } = await setup(t);
  assert.equal((await post('/register', account(), null, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post('/logout', {}, null, { Origin: 'null' })).status, 403);
  assert.equal((await post('/logout', {}, null, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/register', account(), null, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await post('/register', account({ name: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await post('/register', account(), null, { Origin: 'http://127.0.0.1:5173' })).status, 201);
});

test('rate limits repeated account attempts and returns Retry-After', async t => {
  const { post } = await setup(t);
  assert.equal((await post('/register', account())).status, 201);
  for (let i = 0; i < 9; i++) assert.equal((await post('/register', account())).status, 409);
  const limited = await post('/register', account());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('IP limit also covers malformed account attempts', async t => {
  const { post } = await setup(t);
  for (let i = 0; i < 30; i++) assert.equal((await post('/login', { email: 'bad' })).status, 400);
  const limited = await post('/login', { email: 'bad' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('HTTPS configuration marks session and clearing cookies Secure', async t => {
  const { post } = await setup(t, { secureCookies: true });
  const response = await post('/register', account());
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  const logout = await post('/logout', {}, cookieOf(response));
  assert.match(logout.headers.get('set-cookie'), /; Secure/);
});

async function avatarFixture(format = 'png', background = '#4f46e5') {
  return sharp({ create: { width: 600, height: 400, channels: 3, background } })[format]().toBuffer();
}
function avatarForm(bytes, name = 'avatar') {
  const data = new FormData();
  data.append(name, new Blob([bytes]), 'avatar.jpg');
  return data;
}
const uploadAvatar = (url, data, cookie, headers = {}) => fetch(`${url}/api/auth/avatar`, { method: 'PUT', headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: data });

test('avatar upload requires a session, normalizes to 256px WebP, persists in me/login, and replaces old image', async t => {
  const { url, post, me, database } = await setup(t);
  const firstAccount = await post('/register', account());
  const cookie = cookieOf(firstAccount);
  const image = await avatarFixture('jpeg');
  assert.equal((await uploadAvatar(url, avatarForm(image))).status, 401);
  const upload = await uploadAvatar(url, avatarForm(image), cookie);
  assert.equal(upload.status, 200);
  const { user } = await upload.json();
  assert.match(user.avatarUrl, /^\/api\/auth\/avatar\/[a-f0-9-]{36}$/);
  assert.equal((await me(cookie)).user.avatarUrl, user.avatarUrl);
  const avatar = await fetch(url + user.avatarUrl, { headers: { Cookie: cookie } });
  assert.equal(avatar.status, 200);
  assert.equal(avatar.headers.get('content-type'), 'image/webp');
  assert.equal(avatar.headers.get('cache-control'), 'private, no-store');
  assert.equal(avatar.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await avatar.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual([metadata.width, metadata.height], [256, 256]);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined);
  assert.ok(bytes.length < 128 * 1024);
  const login = await post('/login', { email: 'tester@example.com', password: PASSWORD });
  assert.equal((await login.json()).user.avatarUrl, user.avatarUrl);
  const other = await post('/register', account({ email: 'other@example.com' }));
  assert.equal((await fetch(url + user.avatarUrl, { headers: { Cookie: cookieOf(other) } })).status, 404);
  assert.equal((await fetch(url + user.avatarUrl)).status, 401);
  const second = await uploadAvatar(url, avatarForm(await avatarFixture('webp', '#ff8040')), cookie);
  assert.equal(second.status, 200);
  const updated = (await second.json()).user;
  assert.notEqual(updated.avatarUrl, user.avatarUrl);
  assert.equal((await fetch(url + user.avatarUrl, { headers: { Cookie: cookie } })).status, 404);
  assert.ok(database.auth.getAvatar(updated.id, updated.avatarUrl.split('/').at(-1)));
});

test('invalid, excessive, cross-site and wrong-field avatar uploads preserve the previous avatar', async t => {
  const { url, post, me } = await setup(t);
  const cookie = cookieOf(await post('/register', account()));
  const image = await avatarFixture();
  const good = await uploadAvatar(url, avatarForm(image), cookie);
  assert.equal(good.status, 200);
  const original = (await good.json()).user.avatarUrl;
  assert.equal((await uploadAvatar(url, avatarForm(Buffer.from('fake image')), cookie)).status, 400);
  assert.equal((await uploadAvatar(url, avatarForm(image, 'photos'), cookie)).status, 400);
  assert.equal((await uploadAvatar(url, avatarForm(image), cookie, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await uploadAvatar(url, avatarForm(Buffer.alloc(AVATAR_FILE_BYTES + 1)), cookie)).status, 413);
  const two = avatarForm(image); two.append('avatar', new Blob([image]), 'second.png');
  assert.equal((await uploadAvatar(url, two, cookie)).status, 400);
  const fields = avatarForm(image); fields.append('userId', 'another-user');
  assert.equal((await uploadAvatar(url, fields, cookie)).status, 400);
  assert.equal((await uploadAvatar(url, new FormData(), cookie)).status, 400);
  assert.equal((await me(cookie)).user.avatarUrl, original);
  await post('/logout', {}, cookie);
  assert.equal((await uploadAvatar(url, avatarForm(image), cookie)).status, 401);
});

test('avatar bytes and version survive database reopen', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'habitat-avatar-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'gallery.sqlite');
  let savedCookie, savedAvatar, savedBytes;
  await t.test('upload', async child => {
    const { url, post } = await setup(child, { filename });
    savedCookie = cookieOf(await post('/register', account()));
    const response = await uploadAvatar(url, avatarForm(await avatarFixture()), savedCookie);
    assert.equal(response.status, 200);
    savedAvatar = (await response.json()).user.avatarUrl;
    savedBytes = Buffer.from(await (await fetch(url + savedAvatar, { headers: { Cookie: savedCookie } })).arrayBuffer());
  });
  await t.test('reopen', async child => {
    const { url, me } = await setup(child, { filename });
    assert.equal((await me(savedCookie)).user.avatarUrl, savedAvatar);
    const response = await fetch(url + savedAvatar, { headers: { Cookie: savedCookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), savedBytes);
  });
});
