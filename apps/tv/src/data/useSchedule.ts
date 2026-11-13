import type { ScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { getSaved, setSaved } from './cache.js';
import { decodeSchedule, fetchSchedule, type Copy } from './scheduleFetch.js';
import { pollDelay } from './freshness.js';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
  error?: string | null;
};

export function useSchedule(): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ doc: null, status: 'LOADING', error: null });
  useEffect(() => {
    let stopped = false;
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
      timer = setTimeout(
        () => void poll(),
        queued
          ? 0
          : pollDelay(copy?.doc.display.pollIntervalSeconds ?? 180, failures, Math.random()),
      );
      queued = false;
    };
    const online = () => {
      if (active) queued = true;
      else void poll();
    };
    const offline = () => setState((previous) => ({ ...previous, offline: true }));
    const start = async () => {
      if (import.meta.env.DEV) {
        const { loadMockIfRequested, previewUnavailable } = await import('../mock/index.js');
        if (stopped) return;
        if (previewUnavailable()) return setState({ ...initial, status: 'UNAVAILABLE' });
        const mock = await loadMockIfRequested();
        if (stopped) return;
        if (mock)
          return setState({
            ...initial,
            status: 'READY',
            doc: mock,
            lastSuccess: performance.now(),
          });
      }
      for (const saved of await getSaved()) {
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
          // Ignore invalid or obsolete cache entries.
        }
      }
      if (stopped) return;
      if (copy) {
        const age = Date.now() - copy.saved.savedAt;
        setState({
          ...initial,
          status: 'READY',
          doc: copy.doc,
          offline: !navigator.onLine,
          lastSuccess: age >= 0 ? performance.now() - age : null,
        });
      }
      // Yield so React can commit the saved board before attempting the network.
      timer = setTimeout(() => {
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
        void poll();
      }, 0);
    };
    void start().catch(() => {
      if (!stopped) void poll();
    });
    return () => {
      stopped = true;
      active?.abort();
      clearTimeout(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  return state;
}
