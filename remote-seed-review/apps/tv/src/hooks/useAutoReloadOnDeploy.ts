import { useEffect, useRef, useState } from 'react';
import { syncClockWithResponse } from '../data/clockSync.js';

export type TvHoldMode = 'auto' | 'credits' | 'page';

export interface TvHoldState {
  mode: TvHoldMode;
  page?: number;
  updatedAt?: number;
}

const DEFAULT_TV_HOLD: TvHoldState = {
  mode: 'auto',
  page: 1,
  updatedAt: 0,
};

function readPersistedTvHold(): TvHoldState {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('tv_hold_state');
      if (stored) {
        const parsed = JSON.parse(stored) as TvHoldState;
        if (
          parsed &&
          (parsed.mode === 'auto' || parsed.mode === 'credits' || parsed.mode === 'page')
        ) {
          return {
            mode: parsed.mode,
            page: typeof parsed.page === 'number' && parsed.page >= 1 ? Math.floor(parsed.page) : 1,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
          };
        }
      }
    } catch {}
  }
  return DEFAULT_TV_HOLD;
}

const CURRENT_BUILD_ID = (import.meta.env.VITE_BUILD_ID || '').trim();
const POLL_INTERVAL_MS = 2500;
const FETCH_TIMEOUT_MS = 5000;

export function useAutoReloadOnDeploy() {
  const isReloading = useRef(false);
  const lastReloadNonce = useRef<string | null>(null);
  const [tvHold, setTvHold] = useState<TvHoldState>(readPersistedTvHold);

  useEffect(() => {
    const checkVersion = async () => {
      if (isReloading.current) return;
      // Never attempt checks or reloads while offline
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) return;

        const data = (await response.json()) as {
          buildId?: string;
          reloadNonce?: string;
          forceReloadToken?: string;
          serverTimeMs?: number;
          tvHold?: TvHoldState;
        };
        syncClockWithResponse(response, data);

        // Update tvHold state if present
        if (
          data?.tvHold &&
          (data.tvHold.mode === 'auto' ||
            data.tvHold.mode === 'credits' ||
            data.tvHold.mode === 'page')
        ) {
          const freshHold: TvHoldState = {
            mode: data.tvHold.mode,
            page:
              typeof data.tvHold.page === 'number' && data.tvHold.page >= 1
                ? Math.floor(data.tvHold.page)
                : 1,
            updatedAt:
              typeof data.tvHold.updatedAt === 'number' ? data.tvHold.updatedAt : Date.now(),
          };
          setTvHold((prev) => {
            if (
              prev.mode === freshHold.mode &&
              prev.page === freshHold.page &&
              prev.updatedAt === freshHold.updatedAt
            ) {
              return prev;
            }
            try {
              localStorage.setItem('tv_hold_state', JSON.stringify(freshHold));
            } catch {}
            return freshHold;
          });
        }

        const remoteBuildId = data?.buildId?.trim();
        const remoteNonce = (data?.reloadNonce ?? data?.forceReloadToken ?? '').trim();

        // First check records current nonce without triggering reload
        if (lastReloadNonce.current === null) {
          lastReloadNonce.current = remoteNonce || '0';
        }

        const isNewBuild = Boolean(
          CURRENT_BUILD_ID && remoteBuildId && remoteBuildId !== CURRENT_BUILD_ID,
        );
        const isManualReload = Boolean(
          lastReloadNonce.current !== null &&
            remoteNonce &&
            lastReloadNonce.current !== remoteNonce,
        );

        if (isNewBuild || isManualReload) {
          // Double-check network connectivity before triggering reload
          if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

          isReloading.current = true;
          console.log(
            `[AutoReload] Reload triggered (${
              isNewBuild ? `new build ${remoteBuildId}` : `admin reload trigger ${remoteNonce}`
            }). Updating TV display...`,
          );

          // Tell active Service Worker to clear old caches and update
          if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            try {
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
              }
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
              }
            } catch {
              // Ignore service worker update error
            }
          }

          // Clear browser caches
          if (typeof window !== 'undefined' && 'caches' in window) {
            try {
              const keys = await caches.keys();
              for (const key of keys) {
                await caches.delete(key);
              }
            } catch {
              // Ignore cache deletion errors
            }
          }

          // Reload display cleanly only if online
          if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            window.location.reload();
          }
        }
      } catch (err) {
        // Wi-Fi disconnect, timeout or transient network failure: silently ignore to prevent reload loops
        console.warn('[AutoReload] Version check skipped (offline or network error):', err);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // First check after 500ms, then periodic polling every 2500ms (2.5s)
    const initialTimer = setTimeout(checkVersion, 500);
    const intervalTimer = setInterval(checkVersion, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return { tvHold };
}
