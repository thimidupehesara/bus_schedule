import { useEffect, useRef } from 'react';
import { colomboParts } from '@bus-schedule/shared';

const guardKey = 'bus-tv:last-reload';
const dailyKey = 'bus-tv:daily-reload';
const guardMs = 600_000;

export function mayReload(previous: number | null, now: number): boolean {
  return previous === null || now - previous >= guardMs;
}

function read(key: string): string | null {
  const values: string[] = [];
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try {
      const value = window[kind].getItem(key);
      if (value !== null) values.push(value);
    } catch {
      // Try the other store.
    }
  }
  return values[0] ?? null;
}

function write(key: string, value: string): boolean {
  let persisted = false;
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try {
      window[kind].setItem(key, value);
      persisted = true;
    } catch {
      // Try the other store.
    }
  }
  return persisted;
}

function reload(day?: string): void {
  const stored = read(guardKey);
  const parsed = stored === null ? null : Number(stored);
  const now = Date.now();
  if (!mayReload(parsed !== null && Number.isFinite(parsed) ? parsed : null, now)) return;
  if (day && (read(dailyKey) === day || !write(dailyKey, day))) return;
  // Without durable storage we cannot enforce the guard after a reload.
  if (write(guardKey, String(now))) location.reload();
}

export function useMaintenance(
  heartbeat: { current: number },
  offset: number | null,
  reloadAt: string | undefined,
  offline: boolean,
): void {
  const settings = useRef({ offset, reloadAt, offline });
  useEffect(() => {
    settings.current = { offset, reloadAt, offline };
  }, [offset, reloadAt, offline]);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const watchdog = setInterval(() => {
      if (
        !settings.current.offline &&
        navigator.onLine &&
        performance.now() - heartbeat.current > 180_000
      )
        reload();
    }, 60_000);
    const daily = setInterval(() => {
      const { offset, reloadAt } = settings.current;
      if (settings.current.offline || !navigator.onLine || offset === null || !reloadAt) return;
      const local = colomboParts(Date.now() + offset);
      const [hours, minutes] = reloadAt.split(':').map(Number);
      if (local.minutes === (hours ?? 0) * 60 + (minutes ?? 0)) reload(local.date);
    }, 15_000);
    return () => {
      clearInterval(watchdog);
      clearInterval(daily);
    };
  }, [heartbeat]);
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !('serviceWorker' in navigator) ||
      (location.protocol !== 'https:' && location.hostname !== 'localhost')
    )
      return;
    const serviceWorker = navigator.serviceWorker;
    let current = serviceWorker.controller;
    let pendingReload = false;
    const change = () => {
      const next = serviceWorker.controller;
      const replaced = current && next && current !== next;
      current = next;
      if (replaced) {
        pendingReload = true;
        if (!settings.current.offline && navigator.onLine) reload();
      }
    };
    serviceWorker.addEventListener('controllerchange', change);
    const registration = serviceWorker.register('/tv/sw.js', {
      scope: '/tv/',
      updateViaCache: 'none',
    });
    const update = () => {
      if (pendingReload && !settings.current.offline && navigator.onLine) reload();
      void registration.then((reg) => reg.update()).catch(() => {});
    };
    update();
    const timer = setInterval(update, guardMs);
    return () => {
      clearInterval(timer);
      serviceWorker.removeEventListener('controllerchange', change);
    };
  }, []);
}
