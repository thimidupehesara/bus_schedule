import type { ScheduleDocument } from '@bus-schedule/shared';
import { validateScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
  error?: string | null;
};

export function useSchedule(): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ doc: null, status: 'LOADING', error: null });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = 180;
    const setUnavailable = (err?: unknown) => {
      if (!controller.signal.aborted) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error occurred while loading schedule';
        setState((previous) => (previous.doc ? previous : { doc: null, status: 'UNAVAILABLE', error: message }));
      }
    };
    const poll = async () => {
      try {
        const scheduleUrl = `${import.meta.env.BASE_URL}schedule.json`;
        const response = await fetch(scheduleUrl, {
          cache: 'no-cache',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Schedule request failed (${response.status})`);
        const raw: unknown = await response.json();
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
        if (!result.ok) {
          throw new Error(`Schedule document did not validate: ${result.errors.join(', ')}`);
        }
        if (controller.signal.aborted) return;
        interval = result.data.display.pollIntervalSeconds;
        setState({ doc: result.data, status: 'READY', error: null });
      } catch (err) {
        setUnavailable(err);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), interval * 1000);
      }
    };
    const start = async () => {
      if (import.meta.env.DEV) {
        try {
          const { loadMockIfRequested, previewUnavailable } = await import('../mock/index.js');
          if (controller.signal.aborted) return;
          if (previewUnavailable()) return setUnavailable(new Error('Preview unavailable requested'));
          const mock = await loadMockIfRequested();
          if (controller.signal.aborted) return;
          if (mock) {
            setState({ doc: mock, status: 'READY', error: null });
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
