import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  buildBoard,
  colomboParts,
  dayLabel,
  LABELS,
  meridiemBilingual,
  serviceLabel,
  type BoardRow,
  type ScheduleDocument,
  type Weekday,
} from '@bus-schedule/shared';
import {
  clampPage,
  COPY,
  CREDITS_NAME,
  CREDITS_PREFIX,
  departureDay,
  getColumns,
  SHOW_LAST_VERIFIED,
} from './config.js';
import { useSchedule } from './data/useSchedule.js';
import { useNow } from './data/useNow.js';
import { qrPath } from './qr.js';
import { PageCountdown } from './PageCountdown.js';

type Text = { si: string; en: string };
const columns = getColumns();

function Pair({ text }: { text: Text }) {
  return (
    <>
      <span lang="si" className="si">
        {text.si}
      </span>
      <span lang="en" className="en">
        {text.en}
      </span>
    </>
  );
}

function Place({ text }: { text: Text }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const element = ref.current;
      if (!element) return;
      let warned = false;
      const observer = new ResizeObserver(() => {
        if (!warned && element.scrollHeight > element.clientHeight + 1) {
          warned = true;
          console.warn('Truncated station name:', text.si);
        }
      });
      observer.observe(element);
      return () => observer.disconnect();
    }
    return undefined;
  }, [text.si]);
  return (
    <>
      <span
        ref={ref}
        lang="si"
        className={`si place-si${text.si.length > 24 ? ' long-place' : ''}`}
      >
        {text.si}
      </span>
      <span lang="en" className="en place-en">
        {text.en}
      </span>
    </>
  );
}

function Time({ value }: { value: string }) {
  const { clock, si, en } = meridiemBilingual(value);
  return (
    <>
      <strong className="digits">{clock}</strong>
      <span className="meridiem">
        <span lang="si">{si}</span> · <span lang="en">{en}</span>
      </span>
    </>
  );
}

const Header = memo(function Header({
  doc,
  now,
  syncing,
}: {
  doc: ScheduleDocument;
  now: number;
  syncing: boolean;
}) {
  const local = colomboParts(now);
  const hhmm = `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}`;
  const weekday = dayLabel(7, local.weekday)!;
  const meridiem = meridiemBilingual(hhmm);
  return (
    <header className="masthead">
      <h1 lang="si">
        {doc.station.name.si} {LABELS.title.si}
      </h1>
      <div className="clock">
        <div className="clock-time">
          <strong className="digits">{meridiem.clock}</strong>
          <span className="clock-meridiem">
            <span lang="en">{meridiem.en}</span>
            <span lang="si">{meridiem.si}</span>
          </span>
        </div>
        <div className="date">
          <span lang="si">{weekday.si}</span> / {weekday.en} · {local.date}
        </div>
        {syncing && (
          <div className="syncing">
            <Pair text={LABELS.clockSyncing} />
          </div>
        )}
      </div>
    </header>
  );
});

function Alert({ alert }: { alert: NonNullable<ScheduleDocument['alert']> }) {
  return (
    <aside className={`alert alert-${alert.severity.toLowerCase()}`} role="status">
      <span className="alert-icon" aria-hidden="true">
        {alert.severity === 'INFO' ? 'ⓘ' : alert.severity === 'WARNING' ? '⚠' : '⛔'}
      </span>
      <div>
        <Pair text={alert.text} />
      </div>
    </aside>
  );
}

const Footer = memo(function Footer({
  doc,
  setIndicator,
}: {
  doc: ScheduleDocument;
  setIndicator: (element: HTMLDivElement | null) => void;
}) {
  const url = doc.station.mobileUrl;
  const path = useMemo(() => qrPath(url), [url]);
  const shortUrl = url.replace(/^https:\/\//i, '').replace(/\/$/, '');
  return (
    <footer className="footer">
      <div className="phone">
        {path && (
          <svg
            className="qr"
            viewBox="-4 -4 45 45"
            shapeRendering="crispEdges"
            role="img"
            aria-label={`${COPY.qr.si} / ${COPY.qr.en}`}
          >
            <path d={path} />
          </svg>
        )}
        <div>
          <Pair text={LABELS.scanForPhone} />
          <span className="url">{shortUrl}</span>
        </div>
      </div>
      <div className="indicator" ref={setIndicator} />
      <div className="verification">
        {SHOW_LAST_VERIFIED && (
          <>
            <Pair text={LABELS.lastVerified} />
            <time dateTime={doc.lastVerified}>{doc.lastVerified}</time>
          </>
        )}
        <div className="credits" lang="si">
          {CREDITS_PREFIX} {CREDITS_NAME}
        </div>
      </div>
    </footer>
  );
});

function PageIndicator({
  page,
  count,
  deadline,
  reduced,
}: {
  page: number;
  count: number;
  deadline: number | null;
  reduced: boolean;
}) {
  if (count <= 1) return null;
  const dotCount = Math.min(count, 7);
  const firstDot = Math.min(Math.max(0, page - 3), count - dotCount);
  return (
    <div className="page-progress">
      <div>
        <div>
          <span lang="si">{LABELS.page.si}</span> / {LABELS.page.en} {page + 1} / {count}
        </div>
        <div className="dots" aria-hidden="true">
          {Array.from({ length: dotCount }, (_, index) => (
            <span key={index} className={firstDot + index === page ? 'current' : undefined} />
          ))}
        </div>
      </div>
      {deadline !== null && <PageCountdown deadline={deadline} reduced={reduced} />}
    </div>
  );
}

function Row({ row, weekday }: { row?: BoardRow | undefined; weekday: Weekday }) {
  const bus = row?.service;
  const day = row ? departureDay(row.dayOffset, weekday) : null;
  const operator = bus && serviceLabel(bus.operator, bus.serviceType);
  return (
    <tr className={row?.status.toLowerCase()} aria-hidden={row ? undefined : true}>
      {columns.map(({ key }) => (
        <td key={key}>
          <div
            className={`cell ${key}${key === 'departure' && (day || row?.status === 'DEPARTED') ? ' with-badge' : ''}${key === 'destination' && bus?.via ? ' has-via' : ''}${key === 'service' && bus?.serviceType === 'SEMI_LUXURY' ? ' compact' : ''}`}
          >
            {bus && key === 'destination' && (
              <>
                <Place text={bus.destination} />
                {bus.via && (
                  <div className="via">
                    <span lang="si">
                      {LABELS.via.si} {bus.via.si}
                    </span>{' '}
                    / {LABELS.via.en} {bus.via.en}
                  </div>
                )}
              </>
            )}
            {bus && key === 'departure' && (
              <>
                <Time value={bus.departure} />
                {day && (
                  <span className="pill">
                    <span lang="si">{day.si}</span> / {day.en}
                  </span>
                )}
                {row?.status === 'DEPARTED' && (
                  <span className="pill">
                    <span lang="si">{LABELS.departed.si}</span> / {LABELS.departed.en}
                  </span>
                )}
              </>
            )}
            {bus &&
              key === 'arrival' &&
              (bus.arrival ? <Time value={bus.arrival} /> : <span className="dash">—</span>)}
            {bus && key === 'from' && <Place text={bus.origin} />}
            {operator && key === 'service' && (
              <>
                <span className={`operator ${operator.operator.toLowerCase()}`}>
                  {operator.operator}
                </span>
                <Pair text={operator.type} />
              </>
            )}
            {bus && key === 'bay' && (bus.bay ?? '—')}
          </div>
        </td>
      ))}
    </tr>
  );
}

function PagedBoard({
  board,
  display,
  weekday,
  indicator,
}: {
  board: ReturnType<typeof buildBoard>;
  display: ScheduleDocument['display'];
  weekday: Weekday;
  indicator: HTMLDivElement | null;
}) {
  const count = board.pages.length;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const page = clampPage(index, count);
  const fade = reduced ? 0 : display.fadeMs;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    setIndex((previous) => clampPage(previous, count));
  }, [count]);
  useLayoutEffect(() => {
    setHidden(false);
    if (count <= 1) {
      setDeadline(null);
      return;
    }
    const duration = display.dwellSeconds * 1000;
    setDeadline(performance.now() + duration);
    let swap: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      setIndex((current) => (clampPage(current, count) + 1) % count);
      setHidden(false);
    };
    const dwell = setTimeout(() => {
      if (!fade) return advance();
      setHidden(true);
      swap = setTimeout(advance, fade / 2);
    }, duration);
    return () => {
      clearTimeout(dwell);
      clearTimeout(swap);
    };
  }, [count, page, fade, display.dwellSeconds]);
  return (
    <>
      <div className="table-region">
        {board.usedFallbackWindow && board.totalRows > 0 && (
          <div className="fallback">
            <Pair text={COPY.fallback} />
          </div>
        )}
        {board.mode === 'NO_SERVICES' ? (
          <div className="empty">
            <Pair text={COPY.empty} />
          </div>
        ) : (
          <table aria-label={`${LABELS.title.si} / ${LABELS.title.en}`}>
            <colgroup>
              {columns.map(({ key, width }) => (
                <col key={key} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map(({ key }) => (
                  <th
                    scope="col"
                    className={key === 'destination' || key === 'from' ? undefined : 'align-center'}
                    key={key}
                  >
                    <Pair text={LABELS[key]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ opacity: hidden ? 0 : 1, transitionDuration: `${fade / 2}ms` }}>
              {Array.from({ length: display.rowsPerPage }, (_, slot) => (
                <Row key={slot} weekday={weekday} row={board.pages[page]?.rows[slot]} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {indicator &&
        createPortal(
          <PageIndicator page={page} count={count} deadline={deadline} reduced={reduced} />,
          indicator,
        )}
    </>
  );
}

function useScreenShift() {
  const positions = [
    [0, 0],
    [2, -2],
    [-2, 2],
    [2, 2],
    [-2, -2],
  ] as const;
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setPosition((previous) => (previous + 1) % positions.length),
      300_000,
    );
    return () => clearInterval(timer);
  }, [positions.length]);
  return positions[position]!;
}

function Board({ doc, now }: { doc: ScheduleDocument; now: number }) {
  const [indicator, setIndicator] = useState<HTMLDivElement | null>(null);
  const board = useMemo(() => buildBoard(doc, now, { clockSynced: true }), [doc, now]);
  const [x, y] = useScreenShift();
  const alert =
    doc.alert?.enabled && (!doc.alert.expiresAt || Date.parse(doc.alert.expiresAt) > now)
      ? doc.alert
      : null;
  const densePlaces = doc.display.rowsPerPage >= 5;
  const tallAlert = alert && Math.max(alert.text.si.length, alert.text.en.length) > 80;
  const style = {
    '--safe': doc.display.safeAreaPercent,
    '--rows': doc.display.rowsPerPage,
    transform: `translate(${x}px, ${y}px)`,
  } as CSSProperties;
  return (
    <main
      className={`screen${alert ? ' with-alert' : ''}${tallAlert ? ' tall-alert' : ''}${densePlaces ? ' dense-places' : ''}${board.usedFallbackWindow && board.totalRows > 0 ? ' with-fallback' : ''}`}
      style={style}
    >
      <Header doc={doc} now={now} syncing={board.mode === 'CLOCK_UNSYNCED'} />
      {alert && <Alert alert={alert} />}
      <PagedBoard
        board={board}
        display={doc.display}
        weekday={colomboParts(now).weekday}
        indicator={indicator}
      />
      <Footer doc={doc} setIndicator={setIndicator} />
    </main>
  );
}

export default function App() {
  const { doc, status } = useSchedule();
  const now = useNow();
  return doc ? (
    <Board doc={doc} now={now} />
  ) : (
    <main className="empty fullscreen" role="status">
      <Pair text={status === 'UNAVAILABLE' ? LABELS.timetableUnavailable : COPY.loading} />
    </main>
  );
}
