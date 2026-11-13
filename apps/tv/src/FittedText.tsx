import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { computeFit, TEXT_MIN_SCALE } from './fitText.js';

// Re-export so existing imports from FittedText still work.
export { computeFit } from './fitText.js';
export type { FitResult } from './fitText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Layout context – bumped on resize (debounced 150 ms) and after fonts load.
// ─────────────────────────────────────────────────────────────────────────────

const Layout = createContext('');

export function FitLayout({ layout, children }: { layout: string; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (active) setRevision((v) => v + 1);
    };

    const onResize = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, 150);
    };

    window.addEventListener('resize', onResize);
    // Re-measure once after fonts finish loading – fonts load late and cause
    // wrong first measurements.
    void document.fonts.ready.then(refresh);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <Layout.Provider value={layout + ':' + revision}>{children}</Layout.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FittedText – single-line, never wraps; scales font down then truncates.
//
// Sizing rules:
//  • white-space: nowrap keeps it single-line (set in CSS on .fitted).
//  • overflow: hidden is on the *cell box* (.cell), never clipping the span.
//  • line-height >= 1.45 is set globally on [lang=si] so Sinhala diacritics
//    are never clipped vertically.
//  • The span carries text-overflow: ellipsis only when FittedText determines
//    truncation is needed (after reaching TEXT_MIN_SCALE).
// ─────────────────────────────────────────────────────────────────────────────

export function FittedText({
  text,
  className,
  lang,
}: {
  text: string;
  className?: string;
  lang?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const layout = useContext(Layout);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reset to natural size first so we always measure from the base font-size.
    el.style.removeProperty('font-size');
    el.style.removeProperty('text-overflow');

    const { scrollWidth, clientWidth } = el;
    if (clientWidth === 0) return;
    if (scrollWidth <= clientWidth) return; // fits naturally – done.

    const base = parseFloat(getComputedStyle(el).fontSize);
    const { scale, truncate } = computeFit(scrollWidth, clientWidth, TEXT_MIN_SCALE);

    // Enforce a floor of 1 CSS px so text never disappears entirely.
    el.style.fontSize = Math.max(1, base * scale) + 'px';

    if (truncate) {
      el.style.textOverflow = 'ellipsis';
    }
  }, [text, layout, className]);

  return (
    <span
      ref={ref}
      lang={lang}
      className={['fitted', className].filter(Boolean).join(' ')}
    >
      {text}
    </span>
  );
}
