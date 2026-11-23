import { config } from '../server/config.js';
import { createDatabase } from '../server/database.js';
import { createStorage } from '../server/storage.js';
const database = createDatabase(config.databasePath);
const storage = createStorage(config);
try {
  console.log(JSON.stringify({ database: database.inspect(), objects: await storage.list('photos/') }, null, 2));
} finally { database.close(); storage.close(); }
