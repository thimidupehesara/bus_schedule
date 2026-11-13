import { useEffect, useRef, useState } from 'react';

const MINUTE = 60_000;

export function useNow() {
  const heartbeat = useRef(performance.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      heartbeat.current = performance.now();
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, MINUTE - (current % MINUTE));
    };
    const start = async () => {
      if (import.meta.env.DEV) {
        const { previewTime } = await import('../mock/index.js');
        if (stopped) return;
        const fixed = previewTime();
        if (fixed !== undefined) {
          setNow(fixed);
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
    };
  }, []);
  return { now, heartbeat };
}
