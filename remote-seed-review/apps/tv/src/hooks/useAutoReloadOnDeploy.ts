import { useEffect, useRef } from 'react';

const CURRENT_BUILD_ID = (import.meta.env.VITE_BUILD_ID || '').trim();
const POLL_INTERVAL_MS = 60_000;

export function useAutoReloadOnDeploy() {
  const isReloading = useRef(false);
  const lastReloadNonce = useRef<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      if (isReloading.current) return;
      // Never attempt checks or reloads while offline
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      try {
        const response = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) return;

        const data = (await response.json()) as {
          buildId?: string;
          reloadNonce?: string;
          forceReloadToken?: string;
        };
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

          // Reload display cleanly
          window.location.reload();
        }
      } catch (err) {
        // Wi-Fi disconnect or transient network failure: silently ignore to prevent reload loops
        console.warn('[AutoReload] Version check skipped (offline or network error):', err);
      }
    };

    // First check after 10s, then periodic polling every 60s
    const initialTimer = setTimeout(checkVersion, 10_000);
    const intervalTimer = setInterval(checkVersion, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);
}


