import { useLayoutEffect, useRef, useState } from 'react';

const secondsUntil = (deadline: number) =>
  Math.max(0, Math.ceil((deadline - performance.now()) / 1000));

export function PageCountdown({ deadline, reduced }: { deadline: number; reduced: boolean }) {
  const ring = useRef<SVGCircleElement>(null);
  const [seconds, setSeconds] = useState(() => secondsUntil(deadline));

  useLayoutEffect(() => {
    const stroke = ring.current;
    if (!stroke) return;
    stroke.style.transition = 'none';
    stroke.style.strokeDashoffset = '0';
    if (reduced) {
      const tick = () => setSeconds(secondsUntil(deadline));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }

    // Commit the full ring before setting the CSS transition's target.
    stroke.getBoundingClientRect();
    const remaining = Math.max(0, deadline - performance.now());
    stroke.style.transition = `stroke-dashoffset ${remaining}ms linear`;
    stroke.style.strokeDashoffset = '100';
    return undefined;
  }, [deadline, reduced]);

  return (
    <svg className="page-countdown" viewBox="0 0 52 52" aria-hidden="true">
      <circle className="countdown-track" cx="26" cy="26" r="22" />
      <circle className="countdown-ring" ref={ring} cx="26" cy="26" r="22" pathLength="100" />
      {reduced && (
        <text x="26" y="26" dominantBaseline="central" textAnchor="middle">
          {seconds}
        </text>
      )}
    </svg>
  );
}
