import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, hashToken, verifyPassword } from './auth.js';
import { createDatabase } from './database.js';

test('scrypt verifies only the correct password and uses independent salts', async () => {
  const password = 'A long test password 123!';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(password, 'invalid hash'), false);
  assert.ok(!first.includes(password));
});

test('account and session transactions persist; duplicate emails roll back and logout revokes the token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'habitat-auth-core-'));
  let database;
  try {
    const filename = join(dir, 'gallery.sqlite');
    database = createDatabase(filename);
    const tokenHash = hashToken('random-session-token-for-test');
    const user = { id: 'test-user', name: 'Linh', email: 'linh@example.com', passwordHash: 'test-only-hash', createdAt: new Date().toISOString() };
    const session = { tokenHash, userId: user.id, expiresAt: Date.now() + 60000 };
    const registered = database.auth.register(user, session);
    assert.deepEqual(Object.keys(registered).sort(), ['avatarUrl', 'createdAt', 'email', 'id', 'name']);
    assert.throws(() => database.auth.register({ ...user, id: 'duplicate', email: 'LINH@EXAMPLE.COM' }, { ...session, userId: 'duplicate', tokenHash: hashToken('duplicate-token') }));
    assert.equal(database.auth.sessionUser(tokenHash).name, 'Linh');
    database.close();
    database = createDatabase(filename);
    assert.equal(database.auth.findUser('linh@example.com').password_hash, 'test-only-hash');
    assert.equal(database.auth.sessionUser(tokenHash).email, user.email);
    database.auth.revokeSession(tokenHash);
    assert.equal(database.auth.sessionUser(tokenHash), null);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('session rotation revokes the preceding token and expired sessions cannot authenticate', () => {
  const database = createDatabase(':memory:');
  try {
    const oldHash = hashToken('old-token');
    const newHash = hashToken('new-token');
    const user = { id: 'test-user', name: 'Linh', email: 'linh@example.com', passwordHash: 'test-only-hash', createdAt: new Date().toISOString() };
    const session = { tokenHash: oldHash, userId: user.id, expiresAt: Date.now() + 60000 };
    database.auth.register(user, session);
    database.auth.createSession({ ...session, tokenHash: newHash }, oldHash);
    assert.equal(database.auth.sessionUser(oldHash), null);
    assert.equal(database.auth.sessionUser(newHash).id, user.id);
    const expired = hashToken('expired-token');
    database.auth.createSession({ ...session, tokenHash: expired, expiresAt: Date.now() - 1 });
    assert.equal(database.auth.sessionUser(expired), null);
    assert.equal(database.auth.sessionUser(hashToken('unknown-token')), null);
  } finally { database.close(); }
});
