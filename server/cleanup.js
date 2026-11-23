// Idempotent: S3 DeleteObject succeeds even when the object no longer exists.
export async function runCleanup(database, storage, photoId, storageKeys) {
  const allowed = storageKeys ? new Set(storageKeys) : null;
  const jobs = database.pending(photoId).filter(job => !allowed || allowed.has(job.storage_key));
  let cleaned = 0, failed = 0;
  for (const job of jobs) {
    try {
      await storage.remove(job.storage_key);
      database.complete(job);
      cleaned++;
    } catch (error) {
      failed++;
      try { database.failed(job, error); }
      catch { console.error(JSON.stringify({ event: 'cleanup_required', keys: [job.storage_key], photoId: job.photo_id })); }
    }
  }
  return { cleaned, failed };
}
