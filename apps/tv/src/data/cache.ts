export type Saved = {
  schedule: string;
  etag: string | null;
  savedAt: number;
  serverTimeAtSave: number | null;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bus-display', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    let expired = false;
    const fail = (error: unknown) => {
      expired = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Timetable cache open timed out')), 1500);
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('Timetable cache blocked'));
  });
}

const keys = ['schedule', 'etag', 'savedAt', 'serverTimeAtSave'] as const;
const localKey = 'bus-display:schedule';

function read(value: unknown): Saved | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<Saved>;
  return typeof saved.schedule === 'string' && typeof saved.savedAt === 'number'
    ? {
        schedule: saved.schedule,
        etag: typeof saved.etag === 'string' ? saved.etag : null,
        savedAt: saved.savedAt,
        serverTimeAtSave:
          typeof saved.serverTimeAtSave === 'number' ? saved.serverTimeAtSave : null,
      }
    : null;
}

export async function getSaved(): Promise<Saved[]> {
  const candidates: Saved[] = [];
  try {
    const saved = read(JSON.parse(localStorage.getItem(localKey) ?? 'null'));
    if (saved) candidates.push(saved);
  } catch {
    // Storage can be disabled or full.
  }
  try {
    const db = await open();
    try {
      const tx = db.transaction('kv');
      const store = tx.objectStore('kv');
      const requests = keys.map((key) => store.get(key));
      const saved = await new Promise<Saved | null>((resolve, reject) => {
        tx.oncomplete = () =>
          resolve(read(Object.fromEntries(keys.map((key, i) => [key, requests[i]?.result]))));
        tx.onabort = () => reject(tx.error);
      });
      if (saved) candidates.unshift(saved);
    } finally {
      db.close();
    }
  } catch {
    // Use localStorage or start empty.
  }
  return candidates;
}

export async function setSaved(saved: Saved): Promise<void> {
  try {
    const db = await open();
    try {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        for (const key of keys) store.put(saved[key], key);
      });
    } finally {
      db.close();
    }
  } catch {
    try {
      localStorage.setItem(localKey, JSON.stringify(saved));
    } catch {
      // The caller still has the document in memory.
    }
  }
}
