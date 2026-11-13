import type { ScheduleDocument } from '@bus-schedule/shared';
import { useEffect, useState } from 'react';
import { getSaved, setSaved } from './cache.js';
import { decodeSchedule, fetchSchedule, type Copy } from './scheduleFetch.js';
import { pollDelay } from './freshness.js';

export type ScheduleState = {
  doc: ScheduleDocument | null;
  status: 'LOADING' | 'READY' | 'UNAVAILABLE';
  offset: number | null;
  lastSuccess: number | null;
  offline: boolean;
};

const initial: ScheduleState = {
  doc: null,
  status: 'LOADING',
  offset: null,
  lastSuccess: null,
  offline: false,
};

export function useSchedule(): ScheduleState {
  const [state, setState] = useState(initial);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    let copy: Copy | null = null;
    let failures = 0;
    let queued = false;
    let pendingSave = Promise.resolve();

    const poll = async () => {
      if (active || stopped) return;
      clearTimeout(timer);
      active = new AbortController();
      const result = await fetchSchedule(copy, active);
      active = null;
      if (stopped) return;
      if (result.ok) {
        copy = result.copy;
        failures = 0;
        setState((previous) => ({
          doc: result.copy.doc,
          status: 'READY',
          offline: false,
          offset: result.offset ?? previous.offset,
          lastSuccess: performance.now(),
        }));
        pendingSave = pendingSave.then(() => setSaved(result.copy.saved));
      } else {
        failures++;
        setState((previous) => ({
          ...previous,
          offline: true,
          status: previous.doc ? 'READY' : 'UNAVAILABLE',
        }));
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
          const doc = decodeSchedule(saved.schedule);
          if (
            !copy ||
            doc.version > copy.doc.version ||
            (doc.version === copy.doc.version && saved.savedAt > copy.saved.savedAt)
          )
            copy = { doc, saved };
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
