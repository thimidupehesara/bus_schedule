import { memo, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
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
  DEFAULT_SAFE_AREA_PERCENT,
  SHOW_VIA,
  TV_TYPE,
  WEEKDAY_CODES,
  getColumns,
  SHOW_LAST_VERIFIED,
} from './config.js';
import { useSchedule } from './data/useSchedule.js';
import { useNow } from './data/useNow.js';
import { qrPath } from './qr.js';
import { PageCountdown } from './PageCountdown.js';
import { FittedText, FitLayout } from './FittedText.js';
import { useAutoReloadOnDeploy } from './hooks/useAutoReloadOnDeploy.js';
import { initClockSync } from './data/clockSync.js';

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

function HeaderCell({ text }: { text: Text }) {
  return (
    <>
      <FittedText lang="si" className="si" text={text.si} />
      <FittedText lang="en" className="en" text={text.en} />
    </>
  );
}

function Time({ value, badge }: { value: string; badge?: Text | null }) {
  const { clock, si, en } = meridiemBilingual(value);
  return (
    <div className={`time-block${badge ? ' with-badge' : ''}`}>
      <strong className="digits">{clock}</strong>
      <span className="meridiem">
        <span lang="si">{si}</span> · <span lang="en">{en}</span>
      </span>
      {badge && (
        <span className="badge-line">
          <FittedText className="pill" text={badge.si + ' / ' + badge.en} />
        </span>
      )}
    </div>
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
        <span className="title-label">{LABELS.title.si}</span>
      </h1>
      <div className={`clock${syncing ? ' syncing' : ''}`}>
        {syncing ? (
          <div className="clock-sync-badge">
            <span className="sync-pulse" aria-hidden="true" />
            <span lang="si" className="sync-si">
              වේලාව සමමුහුර්ත වෙමින්...
            </span>
            <span className="sync-dot">·</span>
            <span lang="en" className="sync-en">
              Syncing Clock...
            </span>
          </div>
        ) : (
          <>
            <div className="clock-time">
              <strong className="digits">{meridiem.clock}</strong>
              <span className="clock-meridiem">
                <span lang="en">{meridiem.en}</span>
                <span lang="si">{meridiem.si}</span>
              </span>
            </div>
            <div className="date">
              <div>
                <span lang="si">{weekday.si}</span>{' '}
                <span lang="en">{WEEKDAY_CODES[local.weekday - 1]}</span>
              </div>
              <time dateTime={local.date}>{local.date}</time>
            </div>
          </>
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
        </div>
      </div>
      <div className="indicator" ref={setIndicator} />
      <div className="footer-legend">
        <div className="legend-item">
          <span className="legend-swatch legend-swatch-departed" aria-hidden="true" />
          <div className="legend-text">
            <span lang="si" className="legend-si">පිටත් වූ / ආසන්න බස්</span>
            <span lang="en" className="legend-en">Departed / Leaving Soon</span>
          </div>
        </div>
        <div className="legend-item">
          <span className="legend-swatch legend-swatch-soon" aria-hidden="true" />
          <div className="legend-text">
            <span lang="si" className="legend-si">ඊළඟ බස් රථය</span>
            <span lang="en" className="legend-en">Next Upcoming Bus</span>
          </div>
        </div>
      </div>
    </footer>
  );
});

function PageIndicator({
  page,
  count,
}: {
  page: number;
  count: number;
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
            className={`cell ${key}${key === 'destination' && SHOW_VIA && bus?.via ? ' has-via' : ''}${key === 'service' && bus?.serviceType === 'SEMI_LUXURY' ? ' compact' : ''}`}
          >
            {bus && key === 'destination' && (
              <>
                <FittedText lang="si" className="place-si" text={bus.destination.si} />
                <FittedText lang="en" className="place-en" text={bus.destination.en} />
                {SHOW_VIA && bus.via && (
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
              <Time
                value={bus.departure}
                badge={row?.status === 'DEPARTED' ? null : day}
              />
            )}
            {bus &&
              key === 'arrival' &&
              (bus.arrival ? <Time value={bus.arrival} /> : <span className="dash">—</span>)}
            {bus && key === 'from' && (
              <>
                <FittedText lang="si" className="place-si" text={bus.origin.si} />
                <FittedText lang="en" className="place-en" text={bus.origin.en} />
              </>
            )}
            {operator && key === 'service' && (
              <span className={`operator ${operator.operator.toLowerCase()}`}>
                {operator.operator}
              </span>
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
  const totalSchedulePages = board.pages.length;
  const scheduleCount = Math.max(1, totalSchedulePages);
  const totalSlides = scheduleCount + 1;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const slideIndex = clampPage(index, totalSlides);
  const isCreditsSlide = slideIndex === scheduleCount;
  const page = isCreditsSlide ? 0 : clampPage(slideIndex, scheduleCount);
  const fade = reduced ? 0 : display.fadeMs;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    setIndex((previous) => clampPage(previous, totalSlides));
  }, [totalSlides]);
  useLayoutEffect(() => {
    setHidden(false);
    if (totalSlides <= 1) {
      setDeadline(null);
      return;
    }
    const duration = display.dwellSeconds * 1000;
    setDeadline(performance.now() + duration);
    let swap: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      setIndex((current) => (clampPage(current, totalSlides) + 1) % totalSlides);
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
  }, [totalSlides, slideIndex, fade, display.dwellSeconds]);
  useEffect(() => {
    const img = new Image();
    img.src = './credits-slide.webp';
    img.decode?.().catch(() => {});
  }, []);
  return (
    <>
      {deadline !== null && <PageCountdown deadline={deadline} reduced={reduced} />}
      {createPortal(
        <div
          className={`credits-slide${isCreditsSlide ? ' active' : ''}`}
          style={{
            opacity: isCreditsSlide ? (hidden ? 0 : 1) : 0,
            visibility: isCreditsSlide ? 'visible' : 'hidden',
            pointerEvents: isCreditsSlide ? 'auto' : 'none',
            transition: `opacity ${fade / 2}ms ease-in-out, visibility ${fade / 2}ms`,
          }}
          aria-hidden={!isCreditsSlide}
          aria-label="Credits"
        >
          <img
            src="./credits-slide.webp"
            alt="Credits"
            className="credits-slide-img"
            loading="eager"
            decoding="async"
          />
        </div>,
        document.body,
      )}
      <div
        className="table-region"
        style={{
          visibility: isCreditsSlide ? 'hidden' : 'visible',
          opacity: isCreditsSlide ? 0 : hidden ? 0 : 1,
          transition: `opacity ${fade / 2}ms`,
        }}
      >
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
                    <HeaderCell text={LABELS[key]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: display.rowsPerPage }, (_, slot) => (
                <Row key={slot} weekday={weekday} row={board.pages[page]?.rows[slot]} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {indicator &&
        !isCreditsSlide &&
        totalSchedulePages > 0 &&
        createPortal(
          <PageIndicator page={page} count={totalSchedulePages} />,
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

function Board({
  doc,
  now,
  isClockSynced,
}: {
  doc: ScheduleDocument;
  now: number;
  isClockSynced: boolean;
}) {
  const [indicator, setIndicator] = useState<HTMLDivElement | null>(null);
  const board = useMemo(
    () => buildBoard(doc, now, { clockSynced: isClockSynced }),
    [doc, now, isClockSynced],
  );
  const [x, y] = useScreenShift();
  const alert =
    doc.alert?.enabled && (!doc.alert.expiresAt || Date.parse(doc.alert.expiresAt) > now)
      ? doc.alert
      : null;
  const densePlaces = doc.display.rowsPerPage >= 5;
  const tallAlert = alert && Math.max(alert.text.si.length, alert.text.en.length) > 80;
  const style = {
    ...TV_TYPE,
    '--safe': doc.display.safeAreaPercent ?? DEFAULT_SAFE_AREA_PERCENT,
    '--rows': doc.display.rowsPerPage,
    '--shift-x': x + 'px',
    '--shift-y': y + 'px',
  } as CSSProperties;
  return (
    <main
      className={`screen${alert ? ' with-alert' : ''}${tallAlert ? ' tall-alert' : ''}${densePlaces ? ' dense-places' : ''}${board.usedFallbackWindow && board.totalRows > 0 ? ' with-fallback' : ''}`}
      style={style}
    >
      <FitLayout
        layout={[
          doc.display.safeAreaPercent,
          doc.display.rowsPerPage,
          alert?.text.si,
          alert?.text.en,
          board.usedFallbackWindow,
          isClockSynced,
        ].join('|')}
      >
        <Header doc={doc} now={now} syncing={!isClockSynced || board.mode === 'CLOCK_UNSYNCED'} />
        {alert && <Alert alert={alert} />}
        <PagedBoard
          board={board}
          display={doc.display}
          weekday={colomboParts(now).weekday}
          indicator={indicator}
        />
        <Footer doc={doc} setIndicator={setIndicator} />
      </FitLayout>
    </main>
  );
}

export default function App() {
  useAutoReloadOnDeploy();
  useEffect(() => {
    return initClockSync();
  }, []);

  const { doc, status } = useSchedule();
  const { now, isClockSynced } = useNow();

  useEffect(() => {
    const img = new Image();
    img.src = './credits-slide.webp';
    img.decode?.().catch(() => {});
  }, []);

  return doc ? (
    <Board doc={doc} now={now} isClockSynced={isClockSynced} />
  ) : (
    <main className="empty fullscreen" role="status">
      <Pair text={status === 'UNAVAILABLE' ? LABELS.timetableUnavailable : COPY.loading} />
    </main>
  );
}
