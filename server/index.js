import { config } from './config.js';
import { createDatabase } from './database.js';
import { createStorage } from './storage.js';
import { createApp } from './app.js';

const database = createDatabase(config.databasePath);
const storage = createStorage(config);
const production = process.argv.includes('--production');
const app = createApp({ database, storage, production, secureCookies: config.secureCookies });
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Photo Gallery API: http://127.0.0.1:${server.address().port}`);
});
function shutdown() {
  server.close(() => { database.close(); storage.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
