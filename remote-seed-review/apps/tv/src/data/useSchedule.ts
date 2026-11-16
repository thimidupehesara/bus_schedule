import type { ScheduleDocument } from '@bus-schedule/shared';
import { validateScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';
import { syncClockWithResponse } from './clockSync.js';
import sampleScheduleJson from './sample-schedule.json';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
};

export const SCHEDULE_STORAGE_KEY = 'mahiyanganaya_tv_schedule_cache';
const LEGACY_STORAGE_KEY = 'mahiyanganaya_tv_schedule_cached';
const FETCH_TIMEOUT_MS = 5000;

export function getBundledSchedule(): ScheduleDocument {
  const result = validateScheduleDocument(sampleScheduleJson);
  if (result.ok) {
    return result.data;
  }
  return sampleScheduleJson as unknown as ScheduleDocument;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function loadCachedSchedule(): ScheduleDocument | null {
  const storage = getStorage();
  if (!storage) return null;
  for (const key of [SCHEDULE_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const display =
        parsed && typeof parsed === 'object' && 'display' in parsed
          ? (parsed as Record<string, unknown>)['display']
          : null;
      const schedule =
        parsed &&
        typeof parsed === 'object' &&
        display &&
        typeof display === 'object' &&
        !Array.isArray(display) &&
        (!('safeAreaPercent' in display) || (display as Record<string, unknown>)['safeAreaPercent'] == null)
          ? { ...parsed, display: { ...(display as Record<string, unknown>), safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT } }
          : parsed;
      const result = validateScheduleDocument(schedule);
      if (result.ok) return result.data;
    } catch {
      // Ignore invalid JSON or corrupted cache
    }
  }
  return null;
}

export function saveCachedSchedule(doc: ScheduleDocument): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const serialized = JSON.stringify(doc);
    storage.setItem(SCHEDULE_STORAGE_KEY, serialized);
    storage.setItem(LEGACY_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota errors
  }
}

export function useSchedule(): ScheduleState {
  const [state, setState] = useState<ScheduleState>(() => {
    const cached = loadCachedSchedule() ?? getBundledSchedule();
    return {
      doc: cached,
      status: 'READY',
    };
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = 180;

    const poll = async () => {
      const fetchController = new AbortController();
      const timeoutId = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);
      const abortHandler = () => fetchController.abort();
      controller.signal.addEventListener('abort', abortHandler);

      try {
        const response = await fetch('/schedule.json', {
          cache: 'no-store',
          signal: fetchController.signal,
        });
        if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
        const raw: unknown = await response.json();
        syncClockWithResponse(response, raw);
        const display =
          raw && typeof raw === 'object' && 'display' in raw
            ? (raw as Record<string, unknown>)['display']
            : null;
        const schedule =
          raw &&
          typeof raw === 'object' &&
          display &&
          typeof display === 'object' &&
          !Array.isArray(display) &&
          (!('safeAreaPercent' in display) || (display as Record<string, unknown>)['safeAreaPercent'] == null)
            ? { ...raw, display: { ...(display as Record<string, unknown>), safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT } }
            : raw;
        const result = validateScheduleDocument(schedule);
        if (!result.ok) throw new Error('Schedule document did not validate');
        if (controller.signal.aborted) return;
        interval = result.data.display.pollIntervalSeconds;
        saveCachedSchedule(result.data);
        setState({ doc: result.data, status: 'READY' });
      } catch {
        if (!controller.signal.aborted) {
          // Keep existing doc or hydrate from cache/bundled fallback
          setState((previous) => {
            if (previous.doc) return previous;
            const fallback = loadCachedSchedule() ?? getBundledSchedule();
            return { doc: fallback, status: 'READY' };
          });
        }
      } finally {
        clearTimeout(timeoutId);
        controller.signal.removeEventListener('abort', abortHandler);
        if (!controller.signal.aborted) {
          timer = setTimeout(() => void poll(), interval * 1000);
        }
      }
    };

    const start = async () => {
      if (import.meta.env.DEV) {
        try {
          const { loadMockIfRequested, previewUnavailable } = await import('../mock/index.js');
          if (controller.signal.aborted) return;
          if (previewUnavailable()) {
            setState({ doc: null, status: 'UNAVAILABLE' });
            return;
          }
          const mock = await loadMockIfRequested();
          if (controller.signal.aborted) return;
          if (mock) {
            setState({ doc: mock, status: 'READY' });
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      await poll();
    };

    void start();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return state;
}
