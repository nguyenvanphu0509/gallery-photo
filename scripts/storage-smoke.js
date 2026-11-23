// Real S3 integration. Uses its own temporary DB and random photo IDs, never existing photos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { config } from '../server/config.js';
import { createDatabase } from '../server/database.js';
import { createStorage } from '../server/storage.js';
import { uploadPhotos } from '../server/photos.js';
import { runCleanup } from '../server/cleanup.js';
import { fixtureBuffers } from './fixtures.js';

const dir = await mkdtemp(join(tmpdir(), 'gallery-seaweed-'));
const databasePath = join(dir, 'gallery.sqlite');
const storage = createStorage(config);
const originalRemove = storage.remove;
const ownedIds = new Set();
let processApi, url, faultDb;
async function start() {
  processApi = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(),
    env: { ...process.env, PORT: '0', DATABASE_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API did not start within 10s')), 10_000);
    processApi.on('error', reject);
    processApi.on('exit', code => { if (code) reject(new Error(`API exited ${code}: ${text}`)); });
    processApi.stdout.on('data', chunk => { text += chunk; const match = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
    processApi.stderr.on('data', chunk => { text += chunk; });
  });
}
async function stop() {
  if (!processApi || processApi.exitCode !== null) return;
  const exited = once(processApi, 'exit'); processApi.kill('SIGTERM'); await exited; processApi = null;
}
async function command(args) {
  const child = spawn('docker', ['compose', ...args], { stdio: 'inherit' });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, 'docker compose failed');
}
async function waitStorage() {
  for (let i = 0; i < 60; i++) {
    try { await storage.check(); return; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error('SeaweedFS did not become ready');
}
try {
  await storage.ensureBucket();
  const fixtures = await fixtureBuffers();
  await start();
  const body = new FormData(); body.append('title', 'Smoke test'); body.append('alt', 'Ảnh tổng hợp, không có dữ liệu cá nhân');
  for (const name of ['valid.jpg', 'fake.jpg', 'orientation-gps.jpg']) body.append('photos', new Blob([fixtures[name]]), name);
  const response = await fetch(url + '/api/photos', { method: 'POST', body });
  assert.equal(response.status, 200);
  const { results } = await response.json();
  assert.deepEqual(results.map(r => r.status), ['accepted', 'rejected', 'accepted']);
  const photos = results.filter(r => r.status === 'accepted').map(r => r.photo);
  for (const p of photos) ownedIds.add(p.id);
  for (const p of photos) {
    assert.equal((await storage.list(`photos/${p.id}/`)).length, p.variants.length + 1);
    for (const v of p.variants) {
      const media = await fetch(url + v.url);
      assert.equal(media.status, 200); assert.equal(media.headers.get('content-type'), 'image/webp');
      assert.equal((await media.arrayBuffer()).byteLength, v.bytes);
    }
  }
  console.log('PASS: real multipart → metadata → SeaweedFS objects → GET media');
  await stop();
  if (process.argv.includes('--restart-storage')) {
    await command(['restart', 'seaweedfs']);
    await waitStorage();
    console.log('PASS: SeaweedFS restarted without removing its volume');
  }
  await start();
  const gallery = await fetch(url + '/api/photos').then(r => r.json());
  assert.equal(gallery.photos.length, photos.length);
  for (const p of photos) assert.equal((await fetch(url + p.variants[0].url)).status, 200);
  console.log('PASS: API process restarted; gallery and media persist');
  for (const p of photos) {
    assert.equal((await fetch(`${url}/api/photos/${p.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await storage.list(`photos/${p.id}/`)).length, 0);
    assert.equal((await fetch(url + p.variants[0].url)).status, 404);
  }
  await stop();
  faultDb = createDatabase(databasePath);
  assert.equal(faultDb.inspect().photos.length, 0); assert.equal(faultDb.inspect().variants.length, 0);
  console.log('PASS: deletion removes every object and metadata row');

  const publish = faultDb.publish;
  faultDb.publish = () => { throw new Error('injected DB failure after real S3 writes'); };
  const input = () => ({ title: 'Fault', alt: 'Synthetic', files: [{ index: 0, name: 'valid.jpg', buffer: fixtures['valid.jpg'] }] });
  const put = storage.put;
  const faultKeys = [];
  storage.put = async (key, buffer) => { faultKeys.push(key); ownedIds.add(key.split('/')[1]); await put(key, buffer); };
  await uploadPhotos(input(), faultDb, storage);
  for (const key of faultKeys) assert.equal((await storage.list(key)).length, 0);
  assert.equal(faultDb.inspect().cleanup.length, 0);
  console.log('PASS: DB failure compensates objects on real SeaweedFS');

  const remove = storage.remove;
  storage.remove = async () => { throw new Error('injected delete failure'); };
  await uploadPhotos(input(), faultDb, storage);
  assert.equal(faultDb.inspect().cleanup.length, 4);
  const queued = faultDb.inspect().cleanup.map(j => j.storage_key);
  faultDb.close(); faultDb = createDatabase(databasePath);
  storage.remove = remove;
  assert.deepEqual(await runCleanup(faultDb, storage), { cleaned: 4, failed: 0 });
  for (const key of queued) assert.equal((await storage.list(key)).length, 0);
  assert.equal(faultDb.inspect().cleanup.length, 0);
  faultDb.publish = publish;
  console.log('PASS: failed cleanup survives DB reopen and retries against SeaweedFS');
  console.log('All real-storage checks passed.');
} finally {
  await stop();
  faultDb?.close();
  storage.remove = originalRemove;
  // Remove only objects under random IDs created by THIS smoke run.
  for (const id of ownedIds) {
    try { for (const object of await storage.list(`photos/${id}/`)) await storage.remove(object.key); }
    catch (error) { console.error('Test cleanup required:', id, error.message); process.exitCode = 1; }
  }
  storage.close();
  await rm(dir, { recursive: true, force: true });
}
