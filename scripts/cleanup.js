import { config } from '../server/config.js';
import { createDatabase } from '../server/database.js';
import { createStorage } from '../server/storage.js';
import { runCleanup } from '../server/cleanup.js';

const database = createDatabase(config.databasePath);
const storage = createStorage(config);
try {
  const result = await runCleanup(database, storage);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
} finally { database.close(); storage.close(); }
