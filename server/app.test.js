import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { createVariants } from './images.js';
import { runCleanup } from './cleanup.js';
import { limits } from './multipart.js';
import { fixtureBuffers } from '../scripts/fixtures.js';

const fixtures = await fixtureBuffers();
function memoryStorage() {
  const objects = new Map();
  return { objects, failPut: false, failDelete: false,
    async check() {},
    async put(key, buffer) { if (this.failPut) throw new Error('injected storage failure'); objects.set(key, buffer); },
    async get(key) { const buffer = objects.get(key); if (!buffer) throw new Error('missing'); return { body: Readable.from(buffer), length: buffer.length }; },
    async remove(key) { if (this.failDelete) throw new Error('injected delete failure'); objects.delete(key); },
  };
}
async function setup(t) {
  const database = createDatabase(':memory:');
  const storage = memoryStorage();
  const server = createApp({ database, storage }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const register = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: '123456789012345', confirmPassword: '123456789012345' }),
  });
  const setCookie = register.headers.get('set-cookie');
  const cookie = setCookie?.split(';', 1)[0];
  const { user } = await register.json();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input.url;
    if (requestUrl.startsWith(url) && !init.headers?.cookie && !init.headers?.Cookie) {
      init = { ...init, headers: { ...init.headers, Cookie: cookie } };
    }
    return originalFetch(input, init);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); database.close(); });
  return { database, storage, url, cookie, user };
}
function form(files, title = 'Biển', alt = 'Sóng nhỏ trên bờ biển') {
  const data = new FormData();
  data.append('title', title); data.append('alt', alt);
  for (const [name, buffer] of files) data.append('photos', new Blob([buffer]), name);
  return data;
}
const send = (url, files) => fetch(`${url}/api/photos`, { method: 'POST', body: form(files) });

test('mixed upload: publish only valid files, indexed results, real variants, headers, detail and delete', async t => {
  const { url, database, storage } = await setup(t);
  const response = await send(url, [['same.jpg', fixtures['valid.jpg']], ['same.jpg', fixtures['fake.jpg']], ['ok.png', fixtures['valid.png']]]);
  assert.equal(response.status, 200);
  const { results } = await response.json();
  assert.deepEqual(results.map(r => [r.index, r.status]), [[0, 'accepted'], [1, 'rejected'], [2, 'accepted']]);
  const photo = results[0].photo;
  assert.deepEqual(photo.variants.map(v => v.width), [320, 960, 1600]);
  assert.equal(database.inspect().photos.length, 2);
  assert.equal(database.inspect().cleanup.length, 0);
  assert.equal(storage.objects.size, 8);
  const detail = await fetch(`${url}/api/photos/${photo.id}`).then(r => r.json());
  assert.equal(detail.photo.title, 'Biển');
  assert.equal(detail.photo.alt, 'Sóng nhỏ trên bờ biển');
  const media = await fetch(url + photo.variants[0].url);
  assert.equal(media.headers.get('content-type'), 'image/webp');
  assert.equal(media.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  const metadata = await sharp(Buffer.from(await media.arrayBuffer())).metadata();
  assert.equal(metadata.width, 320);
  assert.equal(metadata.exif, undefined);
  assert.equal((await fetch(`${url}/api/photos/${photo.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(url + photo.variants[0].url)).status, 404);
  assert.equal(storage.objects.size, 4);
  assert.equal(database.list().length, 1);
});

test('five files accepted; six files or wrong field reject entire request before writes', async t => {
  const { url, database, storage } = await setup(t);
  const small = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const files = Array.from({ length: 5 }, () => ['same.jpg', small]);
  let response = await send(url, files);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.filter(r => r.status === 'accepted').length, 5);
  const before = storage.objects.size;
  response = await send(url, [...files, files[0]]);
  assert.equal(response.status, 400);
  const data = form(files);
  data.append('unexpected', 'bad');
  assert.equal((await fetch(`${url}/api/photos`, { method: 'POST', body: data })).status, 400);
  assert.equal(storage.objects.size, before);
  assert.equal(database.list().length, 5);
});

test('10 MiB inclusive per file; oversized, truncated, fake and over-pixel file do not publish', async t => {
  const { url, database, storage } = await setup(t);
  const exact = fixtures['over-10MiB.jpg'].subarray(0, limits.fileBytes);
  const response = await send(url, [['exact.jpg', exact], ['big.jpg', fixtures['over-10MiB.jpg']], ['trunc.jpg', fixtures['truncated.jpg']], ['fake.jpg', fixtures['fake.jpg']], ['pixels.png', fixtures['over-40MP.png']]]);
  assert.equal(response.status, 200);
  const { results } = await response.json();
  assert.deepEqual(results.map(r => r.status), ['accepted', 'rejected', 'rejected', 'rejected', 'rejected']);
  assert.equal(results[1].error.code, 'FILE_TOO_LARGE');
  assert.equal(database.list().length, 1);
  assert.equal(storage.objects.size, 4);
});

test('request >55 MiB, including chunked transfer without Content-Length, returns 413 and publishes nothing', async t => {
  const { url, storage, database } = await setup(t);
  const big = Buffer.alloc(limits.requestBytes + 1);
  const declared = await fetch(`${url}/api/photos`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: big });
  assert.equal(declared.status, 413);
  async function* stream() {
    yield Buffer.from('--x\r\nContent-Disposition: form-data; name="photos"; filename="huge.jpg"\r\n\r\n');
    for (let i = 0; i < 56; i++) yield Buffer.alloc(1024 * 1024);
    yield Buffer.from('\r\n--x--\r\n');
  }
  const chunked = await fetch(`${url}/api/photos`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: Readable.from(stream()), duplex: 'half' });
  assert.equal(chunked.status, 413);
  assert.equal(database.list().length, 0);
  assert.equal(storage.objects.size, 0);
});

test('malformed multipart, missing metadata and unexpected file field reject the request', async t => {
  const { url, database } = await setup(t);
  for (const [body, type] of [['not multipart', 'application/json'], ['--x\r\nContent-Disposition: form-data; name="photos"; filename="x.jpg"\r\n\r\nabc', 'multipart/form-data; boundary=x']]) {
    assert.equal((await fetch(`${url}/api/photos`, { method: 'POST', headers: { 'Content-Type': type }, body })).status, 400);
  }
  assert.equal((await send(url, [])).status, 400);
  const data = form([['a.jpg', fixtures['valid.jpg']]], '', 'alt');
  assert.equal((await fetch(`${url}/api/photos`, { method: 'POST', body: data })).status, 400);
  const wrong = new FormData(); wrong.append('title', 'x'); wrong.append('alt', 'y'); wrong.append('photo', new Blob([fixtures['valid.jpg']]), 'x.jpg');
  assert.equal((await fetch(`${url}/api/photos`, { method: 'POST', body: wrong })).status, 400);
  assert.equal(database.list().length, 0);
});

test('orientation is physically applied; EXIF/GPS is stripped; small sources are not enlarged or duplicated', async () => {
  const inputMeta = await sharp(fixtures['orientation-gps.jpg']).metadata();
  assert.equal(inputMeta.orientation, 6); assert.ok(inputMeta.exif);
  const variants = await createVariants(fixtures['orientation-gps.jpg']);
  assert.deepEqual(variants.map(v => [v.width, v.height]), [[320, 480], [800, 1200]]);
  for (const v of variants) {
    const meta = await sharp(v.buffer).metadata();
    assert.equal(meta.exif, undefined); assert.equal(meta.orientation, undefined);
  }
  const tiny = await sharp({ create: { width: 200, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  assert.deepEqual((await createVariants(tiny)).map(v => v.width), [200]);
});

test('DB transaction rolls back a failed variant insert', () => {
  const database = createDatabase(':memory:');
  try {
    assert.throws(() => database.publish({ id: 'id', title: 't', alt: 'a', createdAt: 'now' }, [
      { width: 320, height: 200, mime: 'image/webp', bytes: 1, storageKey: 'same' },
      { width: 960, height: 600, mime: 'image/webp', bytes: 2, storageKey: 'same' },
    ]));
    assert.equal(database.inspect().photos.length, 0);
    assert.equal(database.inspect().variants.length, 0);
  } finally { database.close(); }
});

test('storage fails after a PUT: compensate even the uncertain key, publish nothing', async t => {
  const { url, storage, database } = await setup(t);
  const put = storage.put;
  let count = 0;
  storage.put = async function(key, buffer) { await put.call(this, key, buffer); if (++count === 2) throw new Error('injected timeout after PUT'); };
  const { results } = await (await send(url, [['x.jpg', fixtures['valid.jpg']]])).json();
  assert.equal(results[0].error.code, 'SAVE_FAILED');
  assert.equal(database.list().length, 0); assert.equal(storage.objects.size, 0);
  assert.equal(database.inspect().cleanup.length, 0);
});

test('DB failure after file writes; failed compensation remains queued and can retry', async t => {
  const { url, database, storage } = await setup(t);
  const publish = database.publish;
  database.publish = () => { throw new Error('injected DB commit failure'); };
  storage.failDelete = true;
  const { results } = await (await send(url, [['x.jpg', fixtures['valid.jpg']]])).json();
  assert.equal(results[0].status, 'rejected');
  assert.equal(database.list().length, 0);
  assert.equal(database.inspect().cleanup.length, 4);
  assert.equal(storage.objects.size, 4);
  storage.failDelete = false; database.publish = publish;
  assert.deepEqual(await runCleanup(database, storage), { cleaned: 4, failed: 0 });
  assert.equal(storage.objects.size, 0); assert.equal(database.inspect().cleanup.length, 0);
});

test('delete hides photo before cleanup; 202 on failure; keys survive DB reopen; retry completes', async t => {
  const { url, database, storage } = await setup(t);
  const { results } = await (await send(url, [['x.jpg', fixtures['valid.jpg']]])).json();
  const photo = results[0].photo;
  storage.failDelete = true;
  assert.equal((await fetch(`${url}/api/photos/${photo.id}`, { method: 'DELETE' })).status, 202);
  assert.equal(database.list().length, 0);
  assert.equal(database.inspect().photos[0].status, 'deleting');
  assert.equal(database.inspect().cleanup.length, 4);
  assert.equal((await fetch(url + photo.variants[0].url)).status, 404);
  storage.failDelete = false;
  storage.objects.delete(database.inspect().variants[0].storage_key);
  assert.equal((await fetch(`${url}/api/photos/${photo.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(database.inspect().photos.length, 0);
  assert.equal(database.inspect().variants.length, 0);
  assert.equal(storage.objects.size, 0);
  assert.deepEqual(await runCleanup(database, storage), { cleaned: 0, failed: 0 });
});

test('cleanup intents survive restart; active-upload lease prevents premature removal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-db-'));
  let database;
  try {
    const filename = join(dir, 'db.sqlite');
    database = createDatabase(filename); database.stage('orphan', ['photos/orphan/320.webp']);
    assert.equal(database.pending().length, 0);
    database.close(); database = createDatabase(filename);
    assert.equal(database.inspect().cleanup.length, 1);
    database.release('orphan');
    const storage = memoryStorage(); await storage.put('photos/orphan/320.webp', Buffer.from('test'));
    assert.deepEqual(await runCleanup(database, storage), { cleaned: 1, failed: 0 });
    assert.equal(storage.objects.size, 0);
  } finally { database?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('preset visibility is per user and gallery pagination validates parameters', async t => {
  const { url, database, storage, user, cookie } = await setup(t);
  const hidden = await fetch(`${url}/api/presets/preset-1/hidden`, { method: 'PUT', headers: { Cookie: cookie } });
  assert.equal(hidden.status, 200);
  assert.deepEqual((await hidden.json()).presetIds, ['preset-1']);

  const registerB = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'habitat_session=' },
    body: JSON.stringify({ name: 'User B', email: 'user-b@example.com', password: '123456789012345', confirmPassword: '123456789012345' }),
  });
  const cookieB = registerB.headers.get('set-cookie')?.split(';', 1)[0];
  const hiddenB = await fetch(`${url}/api/presets/hidden`, { headers: { Cookie: cookieB } }).then(r => r.json());
  assert.deepEqual(hiddenB.presetIds, []);
  const meA = await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meA.status, 200);

  for (let i = 0; i < 21; i++) {
    database.publish({
      id: `page-${i}`,
      title: `Photo ${i}`,
      alt: 'Test',
      createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      userId: user.id,
    }, [], null);
  }
  const page1Response = await fetch(`${url}/api/photos?page=1&limit=20`, { headers: { Cookie: cookie } });
  assert.equal(page1Response.status, 200);
  const page1 = await page1Response.json();
  assert.equal(page1.photos.length, 20);
  assert.equal(page1.pagination.total, 21);
  assert.equal(page1.pagination.hasMore, true);
  const page2 = await fetch(`${url}/api/photos?page=2&limit=20`, { headers: { Cookie: cookie } }).then(r => r.json());
  assert.equal(page2.photos.length, 1);
  assert.equal(page2.pagination.hasMore, false);
  assert.equal((await fetch(`${url}/api/photos?page=0&limit=20`, { headers: { Cookie: cookie } })).status, 400);

  const restored = await fetch(`${url}/api/presets/preset-1/hidden`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).presetIds, []);
});

test('CDN cache distinguishes MISS and HIT and blocks cross-user media', async t => {
  const { url, storage, database, cookie, user } = await setup(t);
  const response = await send(url, [['cdn.jpg', fixtures['valid.jpg']]]);
  const body = await response.json();
  const photo = body.results[0].photo;
  const miss = await fetch(url + photo.variants[0].url, { headers: { Cookie: cookie } });
  assert.equal(miss.status, 200);
  assert.equal(miss.headers.get('x-cdn-cache'), 'MISS');
  const hit = await fetch(url + photo.variants[0].url, { headers: { Cookie: cookie } });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get('x-cdn-cache'), 'HIT');

  const registerB = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'habitat_session=' },
    body: JSON.stringify({ name: 'CDN B', email: 'cdn-b@example.com', password: '123456789012345', confirmPassword: '123456789012345' }),
  });
  const cookieB = registerB.headers.get('set-cookie')?.split(';', 1)[0];
  const foreign = await fetch(url + photo.variants[0].url, { headers: { Cookie: cookieB } });
  assert.equal(foreign.status, 404);
});

test('Vite dev origin is accepted through the proxy; foreign origins are rejected', async t => {
  const { url } = await setup(t);
  const body = () => form([['x.jpg', fixtures['valid.jpg']]]);
  assert.equal((await fetch(url + '/api/photos', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' }, body: body() })).status, 200);
  assert.equal((await fetch(url + '/api/photos', { method: 'POST', headers: { Origin: 'https://foreign.example' }, body: body() })).status, 403);
});

test('emergency compensation still deletes objects when DB cannot release cleanup jobs', async t => {
  const { url, database, storage } = await setup(t);
  const release = database.release;
  database.publish = () => { throw new Error('injected DB unavailable'); };
  database.release = () => { throw new Error('injected DB unavailable'); };
  const response = await send(url, [['x.jpg', fixtures['valid.jpg']]]);
  assert.equal((await response.json()).results[0].error.code, 'SAVE_FAILED');
  assert.equal(storage.objects.size, 0);
  assert.equal(database.list().length, 0);
  const jobs = database.inspect().cleanup;
  assert.equal(jobs.length, 4);
  database.release = release;
  database.release(jobs[0].photo_id);
  assert.deepEqual(await runCleanup(database, storage), { cleaned: 4, failed: 0 });
});

test('bonus API serves normalized original, publishes versioned edits, restores, and deletes every version', async t => {
  const { url, storage, database } = await setup(t);
  const { results } = await (await send(url, [['exif.jpg', fixtures['orientation-gps.jpg']]])).json();
  const first = results[0].photo;
  assert.equal(first.currentVersion, 1);
  assert.deepEqual([first.original.width, first.original.height], [800, 1200]);
  const original = await fetch(url + first.original.url);
  assert.equal(original.headers.get('content-type'), 'image/png');
  assert.equal(original.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  const meta = await sharp(Buffer.from(await original.arrayBuffer())).metadata();
  assert.equal(meta.width, 800); assert.equal(meta.height, 1200); assert.equal(meta.exif, undefined);
  const edit = await fetch(`${url}/api/photos/${first.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1, crop: { x: 0, y: 0, width: 400, height: 600 }, rotation: 90, flip: true }) });
  assert.equal(edit.status, 200);
  assert.equal(edit.headers.get('cache-control'), 'no-store');
  const second = (await edit.json()).photo;
  assert.equal(second.currentVersion, 2);
  assert.deepEqual(second.variants.map(v => [v.width, v.height]), [[320, 213], [600, 400]]);
  assert.equal((await fetch(url + first.variants[0].url)).status, 200);
  const newMedia = await fetch(url + second.variants[0].url);
  assert.equal(newMedia.headers.get('content-type'), 'image/webp');
  assert.equal(newMedia.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  const restore = await fetch(`${url}/api/photos/${first.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 2 }) });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).photo.currentVersion, 3);
  assert.equal((await fetch(`${url}/api/photos/${first.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(storage.objects.size, 0);
  assert.equal(database.inspect().variants.length, 0);
  assert.equal((await fetch(url + first.original.url)).status, 404);
});

test('bonus API rejects wrong content type, invalid crop, foreign origin and stale version', async t => {
  const { url } = await setup(t);
  const { results } = await (await send(url, [['x.jpg', fixtures['valid.jpg']]])).json();
  const photo = results[0].photo;
  const data = { expectedVersion: 1, crop: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flip: false };
  const edit = (body, headers = {}) => fetch(`${url}/api/photos/${photo.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await edit(data, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await edit(data, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await edit({ ...data, rotation: 45 })).status, 400);
  assert.equal((await edit({ ...data, crop: { x: -1, y: 0, width: 100, height: 100 } })).status, 400);
  assert.equal((await edit(data)).status, 200);
  assert.equal((await edit(data)).status, 409);
});
