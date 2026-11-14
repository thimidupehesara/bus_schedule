import { useEffect, useState } from 'react';
import { getTrueNow, isClockSynced, subscribeClockSync } from './clockSync.js';

const MINUTE = 60_000;

export type NowState = {
  now: number;
  isClockSynced: boolean;
};

export function useNow(): NowState {
  const [state, setState] = useState<NowState>(() => ({
    now: getTrueNow(),
    isClockSynced: isClockSynced(),
  }));

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (stopped) return;
      const current = getTrueNow();
      setState({
        now: current,
        isClockSynced: isClockSynced(),
      });
      timer = setTimeout(tick, Math.max(1000, MINUTE - (current % MINUTE)));
    };

    const unsubscribe = subscribeClockSync(() => {
      if (!stopped) {
        setState({
          now: getTrueNow(),
          isClockSynced: isClockSynced(),
        });
      }
    });

    const start = async () => {
      if (import.meta.env.DEV) {
        const { previewTime } = await import('../mock/index.js');
        if (stopped) return;
        const fixed = previewTime();
        if (fixed !== undefined) {
          setState({ now: fixed, isClockSynced: true });
          return;
        }
      }
      if (!stopped) tick();
    };

    void start().catch(() => {
      if (!stopped) tick();
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return state;
}
