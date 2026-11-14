import type { ScheduleDocument } from '@bus-schedule/shared';
import { validateScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';
import { syncClockWithResponse } from './clockSync.js';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
};

const SCHEDULE_STORAGE_KEY = 'mahiyanganaya_tv_schedule_cached';

function loadCachedSchedule(): ScheduleDocument | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const display = parsed && typeof parsed === 'object' && 'display' in parsed ? (parsed as Record<string, unknown>)['display'] : null;
    const schedule =
      parsed &&
      typeof parsed === 'object' &&
      display &&
      typeof display === 'object' &&
      !Array.isArray(display) &&
      (!('safeAreaPercent' in display) || (display as Record<string, unknown>)['safeAreaPercent'] == null)
        ? { ...parsed, display: { ...display, safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT } }
        : parsed;
    const result = validateScheduleDocument(schedule);
    if (result.ok) return result.data;
  } catch {
    // Ignore invalid JSON or corrupted cache
  }
  return null;
}

function saveCachedSchedule(doc: ScheduleDocument): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Ignore storage quota errors
  }
}

export function useSchedule(): ScheduleState {
  const [state, setState] = useState<ScheduleState>(() => {
    const cached = loadCachedSchedule();
    return cached
      ? { doc: cached, status: 'READY' }
      : { doc: null, status: 'LOADING' };
  });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = 180;
    const setUnavailable = () => {
      if (!controller.signal.aborted) {
        setState((previous) => {
          if (previous.doc) return previous;
          const cached = loadCachedSchedule();
          if (cached) return { doc: cached, status: 'READY' };
          return { doc: null, status: 'UNAVAILABLE' };
        });
      }
    };
    const poll = async () => {
      try {
        const response = await fetch('/schedule.json', {
          cache: 'no-cache',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Schedule request failed');
        const raw: unknown = await response.json();
        syncClockWithResponse(response, raw);
        const display = raw && typeof raw === 'object' && 'display' in raw ? raw.display : null;
        const schedule =
          raw &&
          typeof raw === 'object' &&
          display &&
          typeof display === 'object' &&
          !Array.isArray(display) &&
          (!('safeAreaPercent' in display) || display.safeAreaPercent == null)
            ? { ...raw, display: { ...display, safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT } }
            : raw;
        const result = validateScheduleDocument(schedule);
        if (!result.ok) throw new Error('Schedule document did not validate');
        if (controller.signal.aborted) return;
        interval = result.data.display.pollIntervalSeconds;
        saveCachedSchedule(result.data);
        setState({ doc: result.data, status: 'READY' });
      } catch {
        setUnavailable();
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), interval * 1000);
      }
    };
    const start = async () => {
      if (import.meta.env.DEV) {
        try {
          const { loadMockIfRequested, previewUnavailable } = await import('../mock/index.js');
          if (controller.signal.aborted) return;
          if (previewUnavailable()) return setUnavailable();
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
