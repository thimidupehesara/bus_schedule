import type { ScheduleDocument } from '@bus-schedule/shared';
import { validateScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
};

export function useSchedule(): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ doc: null, status: 'LOADING' });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = 180;
    const setUnavailable = () => {
      if (!controller.signal.aborted) {
        setState((previous) => (previous.doc ? previous : { doc: null, status: 'UNAVAILABLE' }));
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
