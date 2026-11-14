/**
 * Clock Synchronization and Invalid Clock Detection for Android TV boxes.
 *
 * After power outages, TV boxes without real-time clock (RTC) batteries reset their
 * hardware clocks to default dates (e.g. 2015-01-01).
 *
 * This helper tracks true Sri Lanka time (Asia/Colombo) by anchoring verified server
 * timestamps against monotonic performance.now() across the session.
 */

type ClockAnchor = {
  serverMs: number;
  perfMs: number;
};

let anchor: ClockAnchor | null = null;
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
 * the system clock is before 2026 (e.g. 2015-01-01), returns false.
 */
export function isClockSynced(): boolean {
  if (anchor !== null) return true;
  if (typeof window !== 'undefined' && new Date().getFullYear() < 2026) {
    return false;
  }
  return true;
}

/**
 * Returns the current time in milliseconds, corrected with server time if available.
 */
export function getTrueNow(): number {
  if (anchor !== null) {
    const elapsed = performance.now() - anchor.perfMs;
    return Math.round(anchor.serverMs + elapsed);
  }
  return Date.now();
}

/**
 * Record a verified server timestamp in milliseconds.
 */
export function recordServerTime(serverMs: number): void {
  if (!Number.isFinite(serverMs) || serverMs < 1_700_000_000_000) return;
  anchor = {
    serverMs,
    perfMs: performance.now(),
  };
  notify();
}

/**
 * Inspects a fetch Response and its parsed JSON body to extract server time
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
 * Actively probe the server for time.
 */
export async function probeServerTime(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, {
      cache: 'no-store',
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

