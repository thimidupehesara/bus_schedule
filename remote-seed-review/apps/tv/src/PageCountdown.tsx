import { useLayoutEffect, useRef } from 'react';

export function PageCountdown({ deadline, reduced }: { deadline: number; reduced: boolean }) {
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const fill = bar.current;
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(1)';
    if (reduced) return;

    fill.getBoundingClientRect();
    const remaining = Math.max(0, deadline - performance.now());
    fill.style.transition = `transform ${remaining}ms linear`;
    fill.style.transform = 'scaleX(0)';
    return undefined;
  }, [deadline, reduced]);

  return (
    <div className="page-countdown-bar" aria-hidden="true">
      <div className="countdown-track">
        <div className="countdown-fill" ref={bar} />
      </div>
    </div>
  );
}
