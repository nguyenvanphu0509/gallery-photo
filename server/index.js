import { config } from './config.js';
import { createDatabase } from './database.js';
import { createStorage } from './storage.js';
import { createApp } from './app.js';
import { runCleanup } from './cleanup.js';

const database = createDatabase(config.databasePath);
const storage = createStorage(config);
const production = process.argv.includes('--production');
const app = createApp({ database, storage, production, secureCookies: config.secureCookies });
let cleanupRunning = false;
const cleanupTimer = setInterval(async () => {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const result = await runCleanup(database, storage);
    if (result.cleaned || result.failed) {
      console.log(JSON.stringify({ event: 'scheduled_cleanup', ...result }));
    }
  } finally {
    cleanupRunning = false;
  }
}, Math.max(10_000, config.cleanupIntervalMs));
cleanupTimer.unref();
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Photo Gallery API: http://127.0.0.1:${server.address().port}`);
});
function shutdown() {
  server.close(() => { clearInterval(cleanupTimer); database.close(); storage.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
