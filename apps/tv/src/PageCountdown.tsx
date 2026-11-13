import { useLayoutEffect, useRef, useState } from 'react';

const secondsUntil = (deadline: number) =>
  Math.max(0, Math.ceil((deadline - performance.now()) / 1000));

/**
 * A thin full-width progress bar that shrinks from full to empty over
 * the current page dwell. A single page has a steady bar.
 *
 * Normal: CSS `transform: scaleX` transition (no JS animation loop).
 * Reduced motion: static full bar + whole-seconds text updated by one timer.
 */
export function PageCountdown({
  deadline,
  reduced,
}: {
  deadline: number | null;
  reduced: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (deadline === null) {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(1)';
      return;
    }

    if (reduced) {
      // Static full bar; update text once per second.
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(1)';
      const tick = () => setSeconds(secondsUntil(deadline));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }

    // Snap to full (no transition), then apply the shrink transition.
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    // Force a reflow so the browser commits the initial full state.
    bar.getBoundingClientRect();
    const remaining = Math.max(0, deadline - performance.now());
    bar.style.transition = `transform ${remaining}ms linear`;
    bar.style.transform = 'scaleX(0)';
    return undefined;
  }, [deadline, reduced]);

  return (
    <div className="countdown-bar-track" aria-hidden="true">
      <div ref={barRef} className="countdown-bar-fill" />
      {reduced && deadline !== null && <span className="countdown-bar-seconds">{seconds}</span>}
    </div>
  );
}
