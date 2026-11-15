import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const Layout = createContext('');
const elementParent = (element: HTMLElement | null) => element?.parentElement;

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

      const cs = getComputedStyle(element);
      const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      // Fit to this element's actual content box, including its own max-width restriction.
      for (let attempt = 0; attempt < 4; attempt++) {
        const available = Math.min(clientWidth, element.clientWidth) - padding;
        const required = element.scrollWidth - padding;
        if (available <= 0 || required <= available + 0.5) break;
        const base = parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${Math.max(6, base * (available - 1) / required)}px`;
      }
    };

    fit();
    const rafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(fit) : 0;

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (elementParent(ref.current)) observer?.observe(elementParent(ref.current)!);
    window.addEventListener('resize', fit);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(fit);
    }
    return () => {
      observer?.disconnect();
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
