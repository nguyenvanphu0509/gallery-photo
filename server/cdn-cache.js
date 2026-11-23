export function createCdnCache({ maxEntries = 500, maxBytes = 128 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let bytes = 0;

  function touch(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  function get(key) {
    return touch(key);
  }

  function set(key, value) {
    if (!value || value.length > maxBytes) return;
    const old = entries.get(key);
    if (old) bytes -= old.body.length;
    while (entries.size >= maxEntries || bytes + value.length > maxBytes) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      const removed = entries.get(oldest);
      entries.delete(oldest);
      bytes -= removed.body.length;
    }
    entries.set(key, value);
    bytes += value.length;
  }

  function clearPrefix(prefix) {
    for (const [key, value] of entries) {
      if (key.includes(prefix)) {
        entries.delete(key);
        bytes -= value.body.length;
      }
    }
  }

  function stats() {
    return { entries: entries.size, bytes };
  }

  return { get, set, clearPrefix, stats };
}
