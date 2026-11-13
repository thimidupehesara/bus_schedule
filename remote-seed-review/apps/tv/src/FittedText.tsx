import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TEXT_MIN_SCALE } from './config.js';

const Layout = createContext('');

export function FitLayout({ layout, children }: { layout: string; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) setRevision((value) => value + 1);
    };
    window.addEventListener('resize', refresh);
    void document.fonts.ready.then(refresh);
    return () => {
      active = false;
      window.removeEventListener('resize', refresh);
    };
  }, []);
  return <Layout.Provider value={layout + ':' + revision}>{children}</Layout.Provider>;
}

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
    const element = ref.current;
    if (!element) return;

    const fit = () => {
      element.style.removeProperty('font-size');
      const container = element.parentElement ?? element;
      const clientWidth = container.clientWidth;
      if (clientWidth <= 50) return;

      let availableWidth = clientWidth;
      if (container !== element) {
        const cs = getComputedStyle(container);
        const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        availableWidth = Math.max(0, clientWidth - pad);
      }

      if (availableWidth <= 50) return;

      if (element.scrollWidth > availableWidth) {
        const base = parseFloat(getComputedStyle(element).fontSize);
        const scale = (availableWidth - 2) / element.scrollWidth;
        const minPx = 10;
        const fittedPx = Math.max(minPx, base * scale);
        element.style.fontSize = `${fittedPx}px`;

        // Fine tune if still exceeding target width due to font rounding
        if (element.scrollWidth > availableWidth && fittedPx > minPx) {
          const fineScale = (availableWidth - 2) / element.scrollWidth;
          element.style.fontSize = `${Math.max(minPx, fittedPx * fineScale)}px`;
        }
      }
    };

    fit();
    const rafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(fit) : 0;

    window.addEventListener('resize', fit);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(fit);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', fit);
    };
  }, [text, layout, className]);

  return (
    <span ref={ref} lang={lang} className={['fitted', className].filter(Boolean).join(' ')}>
      {text}
    </span>
  );
}
