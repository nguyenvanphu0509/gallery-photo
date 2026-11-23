import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { httpError } from './errors.js';

export function createDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS Photo (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, alt TEXT NOT NULL,
      created_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('published', 'deleting')),
      user_id TEXT REFERENCES User(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS PhotoVariant (
      photo_id TEXT NOT NULL REFERENCES Photo(id) ON DELETE CASCADE,
      width INTEGER NOT NULL, height INTEGER NOT NULL,
      mime TEXT NOT NULL, bytes INTEGER NOT NULL, storage_key TEXT NOT NULL UNIQUE,
      PRIMARY KEY (photo_id, width)
    );
    CREATE TABLE IF NOT EXISTS CleanupJob (
      storage_key TEXT PRIMARY KEY, photo_id TEXT NOT NULL,
      available_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS photo_date ON Photo(created_at DESC);
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS UserSession (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS HiddenPreset (
      user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      preset_id TEXT NOT NULL,
      PRIMARY KEY (user_id, preset_id)
    );
    CREATE INDEX IF NOT EXISTS session_expiry ON UserSession(expires_at);
  `);
  const userColumns = db.prepare('PRAGMA table_info(User)').all().map(column => column.name);
  for (const [name, type] of [['avatar_data', 'BLOB'], ['avatar_version', 'TEXT']]) {
    if (!userColumns.includes(name)) db.exec(`ALTER TABLE User ADD COLUMN ${name} ${type}`);
  }
  // Additive migration: retain legacy photos and mark those without a normalized original uneditable.
  const columns = db.prepare('PRAGMA table_info(Photo)').all().map(column => column.name);
  for (const [name, definition] of [
    ['current_version', 'INTEGER NOT NULL DEFAULT 1'], ['next_version', 'INTEGER NOT NULL DEFAULT 2'],
    ['original_storage_key', 'TEXT'], ['original_width', 'INTEGER'], ['original_height', 'INTEGER'],
    ['user_id', 'TEXT REFERENCES User(id) ON DELETE CASCADE'],
  ]) if (!columns.includes(name)) db.exec(`ALTER TABLE Photo ADD COLUMN ${name} ${definition}`);
  if (!db.prepare('PRAGMA table_info(PhotoVariant)').all().some(column => column.name === 'version')) {
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE PhotoVariant RENAME TO PhotoVariantLegacy;
      CREATE TABLE PhotoVariant (
        photo_id TEXT NOT NULL REFERENCES Photo(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        mime TEXT NOT NULL, bytes INTEGER NOT NULL, storage_key TEXT NOT NULL UNIQUE,
        PRIMARY KEY (photo_id, version, width)
      );
      INSERT INTO PhotoVariant (photo_id, version, width, height, mime, bytes, storage_key)
        SELECT photo_id, 1, width, height, mime, bytes, storage_key FROM PhotoVariantLegacy;
      DROP TABLE PhotoVariantLegacy;
      COMMIT;`);
  }
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function get(id, includeDeleting = false) {
    const row = db.prepare('SELECT * FROM Photo WHERE id = ?').get(id);
    if (!row || (!includeDeleting && row.status !== 'published')) return null;
    const variants = db.prepare('SELECT * FROM PhotoVariant WHERE photo_id = ? AND version = ? ORDER BY width').all(id, row.current_version);
    return {
      id: row.id, title: row.title, alt: row.alt, createdAt: row.created_at, status: row.status,
      userId: row.user_id,
      currentVersion: row.current_version,
      original: row.original_storage_key ? { width: row.original_width, height: row.original_height, url: `/cdn/media/photos/${row.id}/original.png` } : null,
      variants: variants.map(v => ({ width: v.width, height: v.height, mime: v.mime, bytes: v.bytes,
        url: `/cdn/media/photos/${row.id}/v${v.version}/${v.width}.webp` })),
    };
  }
  function publicUser(row) {
    return row ? { id: row.id, name: row.name, email: row.email, createdAt: row.created_at,
      avatarUrl: row.avatar_version ? `/api/auth/avatar/${row.avatar_version}` : null } : null;
  }
  function insertSession(session, previousHash) {
    db.prepare('DELETE FROM UserSession WHERE expires_at <= ?').run(Date.now());
    if (previousHash) db.prepare('DELETE FROM UserSession WHERE token_hash = ?').run(previousHash);
    db.prepare('INSERT INTO UserSession (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(session.tokenHash, session.userId, session.expiresAt);
  }
  return {
    auth: {
      findUser(email) { return db.prepare('SELECT id, name, email, password_hash, created_at, avatar_version FROM User WHERE email = ?').get(email); },
      register(user, session, previousHash) {
        return transaction(() => {
          db.prepare('INSERT INTO User (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(user.id, user.name, user.email, user.passwordHash, user.createdAt);
          insertSession(session, previousHash);
          return publicUser(db.prepare('SELECT * FROM User WHERE id = ?').get(user.id));
        });
      },
      createSession(session, previousHash) { transaction(() => insertSession(session, previousHash)); },
      sessionUser(tokenHash) {
        return publicUser(db.prepare(`SELECT u.id, u.name, u.email, u.created_at, u.avatar_version
          FROM UserSession s JOIN User u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, Date.now()));
      },
      revokeSession(tokenHash) { db.prepare('DELETE FROM UserSession WHERE token_hash = ?').run(tokenHash); },
      setAvatar(userId, data, version) {
        return transaction(() => {
          const result = db.prepare('UPDATE User SET avatar_data = ?, avatar_version = ? WHERE id = ?').run(data, version, userId);
          if (!result.changes) throw httpError(401, 'Phiên đăng nhập không còn hợp lệ.');
          return publicUser(db.prepare('SELECT id, name, email, created_at, avatar_version FROM User WHERE id = ?').get(userId));
        });
      },
      getAvatar(userId, version) {
        return db.prepare('SELECT avatar_data FROM User WHERE id = ? AND avatar_version = ? AND avatar_data IS NOT NULL').get(userId, version)?.avatar_data;
      },
    },
    list(userId) {
      const rows = userId
        ? db.prepare("SELECT id FROM Photo WHERE status = 'published' AND user_id = ? ORDER BY created_at DESC, id DESC").all(userId)
        : db.prepare("SELECT id FROM Photo WHERE status = 'published' ORDER BY created_at DESC, id DESC").all();
      return rows.map(row => get(row.id));
    },
    listPage(userId, page = 1, limit = 20) {
      const safePage = Math.max(1, Number.isSafeInteger(page) ? page : 1);
      const safeLimit = Math.min(100, Math.max(1, Number.isSafeInteger(limit) ? limit : 20));
      const offset = (safePage - 1) * safeLimit;
      const total = db.prepare("SELECT COUNT(*) AS count FROM Photo WHERE status = 'published' AND user_id = ?").get(userId).count;
      const rows = db.prepare("SELECT id FROM Photo WHERE status = 'published' AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
        .all(userId, safeLimit, offset);
      return {
        photos: rows.map(row => get(row.id)),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          hasMore: offset + rows.length < total,
        },
      };
    },
    ownedBy(id, userId) {
      return Boolean(db.prepare("SELECT 1 FROM Photo WHERE id = ? AND user_id = ?").get(id, userId));
    },
    hiddenPresets(userId) {
      return db.prepare('SELECT preset_id FROM HiddenPreset WHERE user_id = ?').all(userId).map(row => row.preset_id);
    },
    hidePreset(userId, presetId) {
      db.prepare('INSERT OR IGNORE INTO HiddenPreset (user_id, preset_id) VALUES (?, ?)').run(userId, presetId);
    },
    restorePreset(userId, presetId) {
      db.prepare('DELETE FROM HiddenPreset WHERE user_id = ? AND preset_id = ?').run(userId, presetId);
    },
    get,
    getOriginal(id) {
      return db.prepare(`SELECT original_storage_key AS storage_key, original_width AS width, original_height AS height, 'image/png' AS mime
        FROM Photo WHERE id = ? AND status = 'published' AND original_storage_key IS NOT NULL`).get(id);
    },
    getVariant(id, width, version = 1) {
      return db.prepare(`SELECT v.* FROM PhotoVariant v JOIN Photo p ON p.id = v.photo_id
        WHERE p.id = ? AND p.status = 'published' AND v.width = ? AND v.version = ?`).get(id, width, version);
    },
    // Write-ahead intent: if the API crashes after a PUT, the key is still discoverable.
    // The lease prevents a concurrent cleanup command from touching a live upload.
    stage(id, keys) {
      transaction(() => {
        const insert = db.prepare('INSERT INTO CleanupJob (storage_key, photo_id, available_at) VALUES (?, ?, ?)');
        for (const key of keys) insert.run(key, id, Date.now() + 10 * 60_000);
      });
    },
    publish(photo, variants, original) {
      return transaction(() => {
        db.prepare(`INSERT INTO Photo (id, title, alt, created_at, status, original_storage_key, original_width, original_height, user_id)
          VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?)`).run(photo.id, photo.title, photo.alt, photo.createdAt, original?.storageKey || null, original?.width || null, original?.height || null, photo.userId ?? null);
        const insert = db.prepare('INSERT INTO PhotoVariant (photo_id, version, width, height, mime, bytes, storage_key) VALUES (?, 1, ?, ?, ?, ?, ?)');
        for (const v of variants) insert.run(photo.id, v.width, v.height, v.mime, v.bytes, v.storageKey);
        db.prepare('DELETE FROM CleanupJob WHERE photo_id = ?').run(photo.id);
        return get(photo.id);
      });
    },
    release(id) { db.prepare('UPDATE CleanupJob SET available_at = ? WHERE photo_id = ?').run(Date.now(), id); },
    releaseKeys(keys) {
      transaction(() => { for (const key of keys) db.prepare('UPDATE CleanupJob SET available_at = ? WHERE storage_key = ?').run(Date.now(), key); });
    },
    reserveVersion(id, expectedVersion) {
      return transaction(() => {
        const row = db.prepare("SELECT * FROM Photo WHERE id = ? AND status = 'published'").get(id);
        if (!row) throw httpError(404, 'Ảnh không tồn tại hoặc đã bị xóa.');
        if (!row.original_storage_key) throw httpError(409, 'Ảnh cũ chưa có bản gốc chuẩn hóa. Hãy tải lại ảnh để chỉnh sửa.');
        if (row.current_version !== expectedVersion) throw httpError(409, 'Ảnh đã có phiên bản mới. Đóng trình sửa và mở lại.');
        db.prepare('UPDATE Photo SET next_version = next_version + 1 WHERE id = ?').run(id);
        return row.next_version;
      });
    },
    publishVersion(id, expectedVersion, version, variants, retentionMs) {
      return transaction(() => {
        const photo = get(id);
        if (!photo || photo.currentVersion !== expectedVersion) throw httpError(409, 'Ảnh đã bị thay đổi hoặc xóa. Vui lòng tải lại.');
        const insert = db.prepare('INSERT INTO PhotoVariant (photo_id, version, width, height, mime, bytes, storage_key) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const v of variants) insert.run(id, version, v.width, v.height, v.mime, v.bytes, v.storageKey);
        const schedule = db.prepare('INSERT INTO CleanupJob (storage_key, photo_id, available_at) VALUES (?, ?, ?)');
        for (const v of db.prepare('SELECT storage_key FROM PhotoVariant WHERE photo_id = ? AND version = ?').all(id, expectedVersion)) {
          schedule.run(v.storage_key, id, Date.now() + retentionMs);
        }
        db.prepare('UPDATE Photo SET current_version = ? WHERE id = ?').run(version, id);
        for (const v of variants) db.prepare('DELETE FROM CleanupJob WHERE storage_key = ?').run(v.storageKey);
        return get(id);
      });
    },
    markDeleting(id) {
      return transaction(() => {
        if (!get(id, true)) return false;
        db.prepare("UPDATE Photo SET status = 'deleting' WHERE id = ?").run(id);
        const insert = db.prepare(`INSERT INTO CleanupJob (storage_key, photo_id, available_at) VALUES (?, ?, ?)
          ON CONFLICT(storage_key) DO UPDATE SET available_at = excluded.available_at`);
        for (const v of db.prepare('SELECT storage_key FROM PhotoVariant WHERE photo_id = ?').all(id)) insert.run(v.storage_key, id, Date.now());
        const original = db.prepare('SELECT original_storage_key FROM Photo WHERE id = ?').get(id);
        if (original.original_storage_key) insert.run(original.original_storage_key, id, Date.now());
        return true;
      });
    },
    pending(id) {
      return id
        ? db.prepare('SELECT * FROM CleanupJob WHERE photo_id = ? AND available_at <= ?').all(id, Date.now())
        : db.prepare('SELECT * FROM CleanupJob WHERE available_at <= ?').all(Date.now());
    },
    complete(job) {
      transaction(() => {
        db.prepare('DELETE FROM CleanupJob WHERE storage_key = ?').run(job.storage_key);
        db.prepare(`DELETE FROM PhotoVariant WHERE storage_key = ? AND EXISTS (
          SELECT 1 FROM Photo p WHERE p.id = PhotoVariant.photo_id
          AND (p.status = 'deleting' OR p.current_version != PhotoVariant.version))`).run(job.storage_key);
        db.prepare(`DELETE FROM Photo WHERE id = ? AND status = 'deleting'
          AND NOT EXISTS (SELECT 1 FROM CleanupJob WHERE photo_id = ?)`).run(job.photo_id, job.photo_id);
      });
    },
    failed(job, error) {
      db.prepare('UPDATE CleanupJob SET attempts = attempts + 1, last_error = ? WHERE storage_key = ?')
        .run(String(error.message).slice(0, 500), job.storage_key);
    },
    inspect() {
      return { photos: db.prepare('SELECT * FROM Photo').all(), variants: db.prepare('SELECT * FROM PhotoVariant').all(),
        cleanup: db.prepare('SELECT * FROM CleanupJob').all() };
    },
    close() { db.close(); },
  };
}
