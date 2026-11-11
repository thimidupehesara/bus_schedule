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
    element.style.removeProperty('font-size');
    if (element.clientWidth === 0 || element.scrollWidth <= element.clientWidth) return;
    const base = parseFloat(getComputedStyle(element).fontSize);
    const floor = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const scale = Math.max(TEXT_MIN_SCALE, (element.clientWidth - 1) / element.scrollWidth);
    element.style.fontSize = Math.max(floor, base * scale) + 'px';
  }, [text, layout, className]);
  return (
    <span ref={ref} lang={lang} className={['fitted', className].filter(Boolean).join(' ')}>
      {text}
    </span>
  );
}
