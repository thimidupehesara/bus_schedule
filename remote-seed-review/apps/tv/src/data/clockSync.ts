/**
 * Clock Synchronization and Invalid Clock Detection for Android TV boxes.
 *
 * After power outages, TV boxes without real-time clock (RTC) batteries reset their
 * hardware clocks to default dates (e.g. 2015-01-01).
 *
 * This helper tracks true Sri Lanka time (Asia/Colombo) by maintaining a numeric
 * clockOffsetMs (serverTimestampMs - Date.now()) in memory and localStorage
 * ('mahiyanganaya_clock_offset_ms') whenever a live server response succeeds.
 * Live time is computed as Date.now() + clockOffsetMs, advancing monotonically
 * with the device clock even when offline.
 */

export const CLOCK_OFFSET_STORAGE_KEY = 'mahiyanganaya_clock_offset_ms';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function loadStoredClockOffset(): number {
  const storage = getStorage();
  if (storage) {
    try {
      const stored = storage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    } catch {}
  }
  return 0;
}

function saveStoredClockOffset(offset: number): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(offset));
    } catch {}
  }
}

let clockOffsetMs = loadStoredClockOffset();
let hasSyncedWithServer = clockOffsetMs !== 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error('[ClockSync] Listener error:', err);
    }
  }
}

/**
 * Checks if the current clock is valid and synchronized.
 * If no server time has been received in the current boot session AND
 * no stored offset exists AND the system clock is before 2026 (e.g. 2015-01-01), returns false.
 */
export function isClockSynced(): boolean {
  if (hasSyncedWithServer) return true;
  if (clockOffsetMs !== 0) return true;
  if (typeof window !== 'undefined' && new Date().getFullYear() < 2026) {
    return false;
  }
  return true;
}

/**
 * Returns current clock offset in milliseconds (serverTimeMs - localTimeMs).
 */
export function getClockOffsetMs(): number {
  return clockOffsetMs;
}

/**
 * Returns the current time in milliseconds, corrected with server offset if available.
 * Live time = Date.now() + clockOffsetMs
 */
export function getTrueNow(): number {
  return Date.now() + clockOffsetMs;
}

/**
 * Record a verified server timestamp in milliseconds.
 * Calculates clockOffsetMs = serverMs - Date.now() and saves to localStorage.
 */
export function recordServerTime(serverMs: number): void {
  if (!Number.isFinite(serverMs) || serverMs < 1_700_000_000_000) return;
  clockOffsetMs = Math.round(serverMs - Date.now());
  hasSyncedWithServer = true;
  saveStoredClockOffset(clockOffsetMs);
  notify();
}

/**
 * Reset clock sync state and stored offset (used in testing).
 */
export function resetClockSyncForTest(): void {
  clockOffsetMs = 0;
  hasSyncedWithServer = false;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(CLOCK_OFFSET_STORAGE_KEY);
    } catch {}
  }
}

/**
 * Inspects a live fetch Response and its parsed JSON body to extract server time
 * via serverTimeMs, X-Server-Time, or Date headers.
 */
export function syncClockWithResponse(response: Response, payload?: unknown): boolean {
  try {
    // 1. Check serverTimeMs in body
    if (
      payload &&
      typeof payload === 'object' &&
      'serverTimeMs' in payload &&
      typeof (payload as Record<string, unknown>)['serverTimeMs'] === 'number'
    ) {
      const ms = (payload as Record<string, unknown>)['serverTimeMs'] as number;
      if (Number.isFinite(ms) && ms > 1_700_000_000_000) {
        recordServerTime(ms);
        return true;
      }
    }

    // 2. Check X-Server-Time header
    const xTime = response.headers?.get('X-Server-Time');
    if (xTime) {
      const ms = Date.parse(xTime);
      if (Number.isFinite(ms) && ms > 1_700_000_000_000) {
        recordServerTime(ms);
        return true;
      }
    }

    // 3. Check HTTP Date header
    const dateHeader = response.headers?.get('Date');
    if (dateHeader) {
      const ms = Date.parse(dateHeader);
      if (Number.isFinite(ms) && ms > 1_700_000_000_000) {
        recordServerTime(ms);
        return true;
      }
    }
  } catch {
    // Ignore header parsing errors
  }
  return false;
}

/**
 * Subscribe to clock synchronization changes (e.g. snapping from unsynced to synced).
 */
export function subscribeClockSync(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Actively probe the server for time with a 5000ms timeout.
 */
export async function probeServerTime(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return syncClockWithResponse(res, data);
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Initialize automatic background time sync and network listeners.
 */
export function initClockSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const trySync = async () => {
    if (destroyed) return;
    const success = await probeServerTime();
    if (destroyed) return;

    if (!success && !isClockSynced()) {
      // Retry aggressively every 5 seconds while clock is invalid (offline after boot)
      timer = setTimeout(() => void trySync(), 5000);
    } else {
      // Once synced, poll every 5 minutes to prevent long-term clock drift
      timer = setTimeout(() => void trySync(), 300_000);
    }
  };

  void trySync();

  const handleOnline = () => {
    void trySync();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  return () => {
    destroyed = true;
    clearTimeout(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
  };
}
