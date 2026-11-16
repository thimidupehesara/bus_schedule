import { useEffect, useState } from 'react';
import { getTrueNow, isClockSynced, subscribeClockSync } from './clockSync.js';

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

    const tick = () => {
      if (stopped) return;
      setState({
        now: getTrueNow(),
        isClockSynced: isClockSynced(),
      });
    };

    // 1-second interval ensures live time continuously advances offline and in tests
    const intervalId = setInterval(tick, 1000);

    const unsubscribe = subscribeClockSync(() => {
      if (!stopped) tick();
    });

    const start = async () => {
      if (import.meta.env.DEV) {
        try {
          const { previewTime } = await import('../mock/index.js');
          if (stopped) return;
          const fixed = previewTime();
          if (fixed !== undefined) {
            setState({ now: fixed, isClockSynced: true });
            clearInterval(intervalId);
            return;
          }
        } catch {
          // Ignore mock loading errors
        }
      }
      if (!stopped) tick();
    };

    void start().catch(() => {
      if (!stopped) tick();
    });

    return () => {
      stopped = true;
      clearInterval(intervalId);
      unsubscribe();
    };
  }, []);

  return state;
}
