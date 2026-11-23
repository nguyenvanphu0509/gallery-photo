import { resolve } from 'node:path';

export const config = {
  port: Number(process.env.PORT || 3001),
  databasePath: resolve(process.env.DATABASE_PATH || '.data/gallery.sqlite'),
  secureCookies: process.env.COOKIE_SECURE === 'true',
  cleanupIntervalMs: Number(process.env.CLEANUP_INTERVAL_MS || 60_000),
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:8333',
  region: process.env.S3_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET || 'moments',
  accessKeyId: process.env.S3_ACCESS_KEY || 'gallery-local',
  secretAccessKey: process.env.S3_SECRET_KEY || 'gallery-local-secret',
};
