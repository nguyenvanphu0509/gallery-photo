import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createDatabase } from './database.js';
import { uploadPhotos } from './photos.js';
import { editPhoto, editPixels, validateEdit } from './edits.js';
import { runCleanup } from './cleanup.js';
import { originalCropFromArea } from '../src/editor-geometry.js';

function memoryStorage() {
  const objects = new Map();
  return { objects,
    async put(key, bytes) { objects.set(key, bytes); },
    async get(key) { const bytes = objects.get(key); if (!bytes) throw new Error('Missing object'); return { body: Readable.from(bytes), length: bytes.length }; },
    async remove(key) { objects.delete(key); },
  };
}

async function setup(t) {
  const database = createDatabase(':memory:');
  t.after(() => database.close());
  const storage = memoryStorage();
  const buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ff8040' } }).jpeg()
    .withExif({ IFD0: { Orientation: '1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 0/1 0/1' } }).toBuffer();
  const { results } = await uploadPhotos({ title: 'Edit test', alt: 'Synthetic image', files: [{ index: 0, name: 'test.jpg', buffer }] }, database, storage);
  assert.equal(results[0].status, 'accepted');
  return { database, storage, photo: results[0].photo };
}
const input = (expectedVersion, overrides = {}) => ({ expectedVersion, crop: { x: 100, y: 100, width: 600, height: 400 }, rotation: 90, flip: true, ...overrides });

test('normalized original is lossless, oriented, metadata-free; editing and restore publish independent versions', async t => {
  const { database, storage, photo } = await setup(t);
  assert.equal(photo.currentVersion, 1);
  assert.deepEqual([photo.original.width, photo.original.height], [1200, 800]);
  const originalKey = database.getOriginal(photo.id).storage_key;
  const originalBytes = storage.objects.get(originalKey);
  const meta = await sharp(originalBytes).metadata();
  assert.equal(meta.format, 'png'); assert.equal(meta.exif, undefined); assert.equal(meta.orientation, undefined);
  const firstKeys = database.inspect().variants.map(row => row.storage_key);
  const firstBuffers = firstKeys.map(key => storage.objects.get(key));
  const edited = await editPhoto(photo.id, input(1), database, storage, { retentionMs: 0 });
  assert.equal(edited.currentVersion, 2);
  assert.deepEqual(edited.variants.map(v => [v.width, v.height]), [[320, 480], [400, 600]]);
  assert.ok(edited.variants.every(v => v.url.includes('/v2/')));
  assert.equal(storage.objects.get(originalKey), originalBytes);
  assert.ok(firstKeys.every(key => storage.objects.has(key)));
  assert.deepEqual(await runCleanup(database, storage), { cleaned: 3, failed: 0 });
  assert.equal(database.inspect().variants.length, 2);
  assert.ok(firstKeys.every(key => !storage.objects.has(key)));
  const restored = await editPhoto(photo.id, { expectedVersion: 2 }, database, storage, { restore: true });
  assert.equal(restored.currentVersion, 3);
  assert.deepEqual(restored.variants.map(v => v.width), [320, 960, 1200]);
  const restoredRows = database.inspect().variants.filter(row => row.version === 3);
  restoredRows.forEach((row, index) => assert.deepEqual(storage.objects.get(row.storage_key), firstBuffers[index]));
  for (const row of restoredRows) assert.equal((await sharp(storage.objects.get(row.storage_key)).metadata()).exif, undefined);
  assert.equal(storage.objects.get(originalKey), originalBytes);
  database.markDeleting(photo.id);
  assert.equal(database.get(photo.id), null);
  const result = await runCleanup(database, storage, photo.id);
  assert.equal(result.failed, 0);
  assert.equal(storage.objects.size, 0);
  assert.equal(database.inspect().variants.length, 0);
  assert.equal(database.inspect().photos.length, 0);
});

test('crop, rotation and flip are validated against ORIGINAL dimensions before writes', async t => {
  const { database, storage, photo } = await setup(t);
  for (const overrides of [
    { crop: { x: -1, y: 0, width: 1, height: 1 } }, { crop: { x: 0, y: 0, width: 0, height: 1 } },
    { crop: { x: 1000, y: 0, width: 500, height: 100 } }, { crop: { x: 0.5, y: 0, width: 100, height: 100 } },
    { rotation: 45 }, { rotation: '90' }, { flip: 'true' }, { expectedVersion: 0 }, { extra: 'ignored?' },
  ]) await assert.rejects(editPhoto(photo.id, input(1, overrides), database, storage), error => error.status === 400);
  assert.equal(storage.objects.size, 4);
  assert.equal(database.get(photo.id).currentVersion, 1);
  await editPhoto(photo.id, input(1), database, storage);
  // This region is outside the 400x600 variant, but inside the original 1200x800.
  const second = await editPhoto(photo.id, input(2, { crop: { x: 900, y: 600, width: 300, height: 200 }, rotation: 0, flip: false }), database, storage);
  assert.deepEqual(second.variants.map(v => [v.width, v.height]), [[300, 200]]);
  await assert.rejects(editPhoto(photo.id, input(1), database, storage), error => error.status === 409);
  assert.throws(() => validateEdit({ expectedVersion: 1, flip: true }, 100, 100, true), error => error.status === 400);
});

test('failed variant PUT leaves the current version usable and cleans only the attempted new keys', async t => {
  const { database, storage, photo } = await setup(t);
  const published = [...storage.objects.keys()];
  const put = storage.put;
  let count = 0;
  storage.put = async (key, bytes) => { await put(key, bytes); if (++count === 2) throw new Error('Timeout after write'); };
  await assert.rejects(editPhoto(photo.id, input(1), database, storage), error => error.status === 503);
  assert.equal(database.get(photo.id).currentVersion, 1);
  assert.deepEqual([...storage.objects.keys()].sort(), published.sort());
  assert.equal(database.inspect().cleanup.length, 0);
  storage.put = put;
  const success = await editPhoto(photo.id, input(1), database, storage);
  assert.equal(success.currentVersion, 3, 'a failed version number is never reused');
});

test('failed DB publication and failed compensation retain retryable jobs without releasing published versions', async t => {
  const { database, storage, photo } = await setup(t);
  await editPhoto(photo.id, input(1), database, storage);
  const v1Jobs = database.inspect().cleanup.filter(job => job.storage_key.includes('/v1/'));
  const publish = database.publishVersion;
  database.publishVersion = () => { throw new Error('DB write failed'); };
  const remove = storage.remove;
  storage.remove = async () => { throw new Error('Delete unavailable'); };
  await assert.rejects(editPhoto(photo.id, input(2), database, storage), error => error.status === 503);
  assert.equal(database.get(photo.id).currentVersion, 2);
  assert.deepEqual(database.inspect().cleanup.filter(job => job.storage_key.includes('/v1/')), v1Jobs);
  storage.remove = remove; database.publishVersion = publish;
  const cleanup = await runCleanup(database, storage);
  assert.equal(cleanup.failed, 0); assert.equal(cleanup.cleaned, 2);
  assert.ok([...storage.objects.keys()].some(key => key.includes('/v2/')));
  assert.ok([...storage.objects.keys()].some(key => key.includes('/v1/')));
});

test('crop coordinates from react-easy-crop match crop → clockwise rotation → horizontal flip for every angle', async () => {
  const width = 4, height = 3;
  const colors = Buffer.from(Array.from({ length: width * height }, (_, index) => [index * 15, index * 7, 255 - index * 10]).flat());
  const source = await sharp(colors, { raw: { width, height, channels: 3 } }).png().toBuffer();
  for (const rotation of [0, 90, 180, 270]) for (const flip of [false, true]) {
    const whole = await editPixels(source, { crop: { x: 0, y: 0, width, height }, rotation, flip });
    const area = { x: 1, y: 0, width: 2, height: 2 };
    const originalCrop = originalCropFromArea(area, width, height, rotation, flip);
    const actual = await editPixels(source, { crop: originalCrop, rotation, flip });
    const expected = await sharp(whole.data, { raw: whole.info }).extract({ left: area.x, top: area.y, width: area.width, height: area.height }).raw().toBuffer();
    assert.deepEqual(actual.data, expected, `rotation=${rotation}, flip=${flip}`);
  }
});

test('legacy database migration preserves photos, keys and dimensions; missing originals cannot be faked', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-edit-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = join(dir, 'gallery.sqlite');
  const old = new DatabaseSync(filename);
  old.exec(`CREATE TABLE Photo (id TEXT PRIMARY KEY, title TEXT, alt TEXT, created_at TEXT, status TEXT);
    CREATE TABLE PhotoVariant (photo_id TEXT, width INTEGER, height INTEGER, mime TEXT, bytes INTEGER, storage_key TEXT UNIQUE, PRIMARY KEY(photo_id, width));
    INSERT INTO Photo VALUES ('legacy', 'Old', 'Legacy image', '2026-01-01', 'published');
    INSERT INTO PhotoVariant VALUES ('legacy', 320, 240, 'image/webp', 42, 'photos/legacy/320.webp');`);
  old.close();
  const database = createDatabase(filename);
  try {
    assert.equal(database.get('legacy').currentVersion, 1);
    assert.equal(database.get('legacy').original, null);
    assert.equal(database.getVariant('legacy', 320).storage_key, 'photos/legacy/320.webp');
    assert.equal(database.getVariant('legacy', 320, 1).height, 240);
    await assert.rejects(editPhoto('legacy', input(1), database, memoryStorage()), error => error.status === 409);
  } finally { database.close(); }
});
