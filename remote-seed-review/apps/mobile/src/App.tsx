import { useEffect, useMemo, useState } from 'react';
import {
  buildBoard,
  colomboParts,
  meridiemBilingual,
  type BoardRow,
  type ScheduleDocument,
} from '@bus-schedule/shared';

const CACHE_KEY = 'mahiyanganaya_bus_schedule_cache_v1';

type Category = 'WRONG_TIME' | 'MISSING_BUS' | 'APP_ISSUE' | 'OTHER';

const CATEGORIES: { id: Category; si: string; en: string }[] = [
  { id: 'WRONG_TIME', si: 'වේලාව වැරදියි', en: 'Wrong Time' },
  { id: 'MISSING_BUS', si: 'බස් රථයක් නැත', en: 'Missing Bus' },
  { id: 'APP_ISSUE', si: 'වෙබ් දෝෂයක්', en: 'App Issue' },
  { id: 'OTHER', si: 'වෙනත්', en: 'Other' },
];

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function App() {
  const [doc, setDoc] = useState<ScheduleDocument | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? (JSON.parse(cached) as ScheduleDocument) : null;
    } catch {
      return null;
    }
  });
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(!doc);
  const [now, setNow] = useState(() => Date.now());
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [fullDay, setFullDay] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Install PWA & APK state
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('mahiyanganaya_install_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [hasApkDownload, setHasApkDownload] = useState(false);

  // Standalone detection and PWA install prompt capture
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandaloneApp(standalone);

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, []);

  // Check if direct APK download exists in public folder
  useEffect(() => {
    async function checkApk() {
      try {
        const res = await fetch('./mahiyanganaya-bus-mobile.apk', { method: 'HEAD' });
        if (res.ok) {
          setHasApkDownload(true);
        }
      } catch {
        // APK not available yet
      }
    }
    void checkApk();
  }, []);

  // Clock ticker every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch schedule
  useEffect(() => {
    let active = true;
    async function loadSchedule() {
      try {
        const res = await fetch('/schedule.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ScheduleDocument;
        if (!active) return;
        setDoc(data);
        setIsOffline(false);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {}
      } catch {
        if (!active) return;
        if (doc) {
          setIsOffline(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSchedule();
    const interval = setInterval(loadSchedule, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Extract unique destinations sorted strictly A–Z by English name
  const uniqueDestinations = useMemo(() => {
    if (!doc?.services) return [];
    const map = new Map<string, { en: string; si: string }>();
    for (const s of doc.services) {
      if (s.destination?.en && !map.has(s.destination.en)) {
        map.set(s.destination.en, { en: s.destination.en, si: s.destination.si });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.en.localeCompare(b.en, 'en', { sensitivity: 'base' }),
    );
  }, [doc]);

  // Compute timetable rows using shared board engine
  const boardRows = useMemo(() => {
    if (!doc) return [];
    const lookaheadHours = fullDay ? 24 : doc.display?.lookaheadHours || 8;
    const boardDoc: ScheduleDocument = {
      ...doc,
      display: {
        ...doc.display,
        lookaheadHours,
        rowsPerPage: 500,
      },
    };
    const result = buildBoard(boardDoc, now, {
      maxDepartedRows: 2,
    });
    return result.pages.flatMap((p) => p.rows);
  }, [doc, now, fullDay]);

  // Filter rows by selected destination
  const filteredRows = useMemo(() => {
    return boardRows.filter((r) => {
      if (selectedDestination) {
        if (r.service.destination.en !== selectedDestination) {
          return false;
        }
      }
      return true;
    });
  }, [boardRows, selectedDestination]);

  // Live Colombo clock formatted
  const colombo = useMemo(() => colomboParts(now), [now]);
  const hhmm = useMemo(() => {
    const h = String(Math.floor(colombo.minutes / 60)).padStart(2, '0');
    const m = String(colombo.minutes % 60).padStart(2, '0');
    return `${h}:${m}`;
  }, [colombo.minutes]);
  const liveMeridiem = useMemo(() => meridiemBilingual(hhmm), [hhmm]);

  const handleInstallClick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
        setBannerDismissed(true);
      }
    } else {
      setShowInstructions((prev) => !prev);
    }
  };

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem('mahiyanganaya_install_dismissed', '1');
    } catch {}
  };

  return (
    <div className="mobile-app">
      {/* Sticky Header */}
      <header className="mobile-header">
        <div className="header-brand">
          <h1 className="header-title-si">මහියංගන දුර ගමන් බස් රථ ධාවන කාලසටහන</h1>
          <div className="header-title-en">Mahiyanganaya Bus Stand</div>
        </div>
        <div className="header-right">
          <div className="live-clock">
            <span className="clock-digits">{liveMeridiem.clock}</span>
            <span className="clock-meridiem">
              <span>{liveMeridiem.en}</span>
              <span className="clock-si">{liveMeridiem.si}</span>
            </span>
          </div>
          <button
            type="button"
            className="caution-btn"
            onClick={() => setModalOpen(true)}
            aria-label="Report issue"
            title="වාර්තා කරන්න / Report Issue"
          >
            ⚠️
          </button>
        </div>
      </header>

      {/* Offline banner */}
      {isOffline && (
        <div className="offline-banner" role="status">
          <span>⚠️ ඔබ නොබැඳිව සිටියි. සුරකින ලද කාලසටහන පෙන්වයි.</span>
          <span className="offline-en">Offline mode. Showing cached timetable.</span>
        </div>
      )}

      {/* Sticky Filter Region with Dropdown & 8h/Full Day Toggle */}
      <section className="filter-section">
        <div className="select-wrapper">
          <label htmlFor="destination-select" className="visually-hidden">
            ගමනාන්තය තෝරන්න / Select Destination
          </label>
          <select
            id="destination-select"
            className="destination-select"
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
          >
            <option value="">සියල්ල · All Destinations</option>
            {uniqueDestinations.map((d) => (
              <option key={d.en} value={d.en}>
                {d.en} · {d.si}
              </option>
            ))}
          </select>
          <span className="select-arrow" aria-hidden="true">
            ▼
          </span>
        </div>

        {/* View Range Toggle */}
        <div className="range-toggle-wrapper">
          <div className="range-toggle">
            <button
              type="button"
              className={`toggle-option ${!fullDay ? 'active' : ''}`}
              onClick={() => setFullDay(false)}
            >
              ඉදිරි පැය 8 · Next 8 Hours
            </button>
            <button
              type="button"
              className={`toggle-option ${fullDay ? 'active' : ''}`}
              onClick={() => setFullDay(true)}
            >
              මුළු දිනම · Full Day ({boardRows.length})
            </button>
          </div>
        </div>
      </section>

      {/* Schedule List Content */}
      <main className="schedule-content">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" />
            <p>කාලසටහන පූරණය වෙමින් පවතී...</p>
            <p className="subtext">Loading bus schedule...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">බස් රථ හමු නොවීය</p>
            <p className="subtext">No matching bus departures found.</p>
            {selectedDestination && (
              <button
                type="button"
                className="reset-btn"
                onClick={() => setSelectedDestination('')}
              >
                පෙරහන් ඉවත් කරන්න · Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="cards-list">
            {filteredRows.map((row) => (
              <ScheduleCard key={`${row.service.id}-${row.departureAt}`} row={row} />
            ))}
          </div>
        )}
      </main>

      {/* Suggestion / Report Modal */}
      {modalOpen && (
        <SuggestionModal
          prefilledRoute={selectedDestination}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Install App / Direct APK Banner */}
      {!isStandaloneApp && !bannerDismissed && (
        <aside className="install-banner" aria-label="Install mobile app">
          <div className="install-banner-main">
            <div className="install-info">
              <span className="install-icon" aria-hidden="true">📱</span>
              <div className="install-labels">
                <span className="install-title">මහියංගනය බස් ඇප් එක</span>
                <span className="install-subtitle">Mahiyanganaya Bus Schedule</span>
              </div>
            </div>
            <div className="install-actions">
              <button
                type="button"
                className="install-btn"
                onClick={handleInstallClick}
              >
                ඇප් එක දාගන්න · Install App
              </button>
              {hasApkDownload && (
                <a
                  href="./mahiyanganaya-bus-mobile.apk"
                  download="mahiyanganaya-bus-mobile.apk"
                  className="apk-download-btn"
                >
                  Direct APK Download ⬇️
                </a>
              )}
              <button
                type="button"
                className="banner-close"
                onClick={handleDismissBanner}
                aria-label="Close install banner"
                title="වසන්න / Close"
              >
                ✕
              </button>
            </div>
          </div>
          {showInstructions && (
            <div className="install-instructions">
              <span>💡 බ්‍රව්සරයේ මෙනුව (<strong>⋮</strong> හෝ <strong>Share</strong>) ඔබා <strong>Add to Home screen</strong> හෝ <strong>Install App</strong> තෝරන්න.</span>
              <span className="inst-en">Tap browser menu (<strong>⋮</strong> or <strong>Share</strong>) and select <strong>Add to Home screen</strong>.</span>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function ScheduleCard({ row }: { row: BoardRow }) {
  const { service, status, dayOffset } = row;
  const isSoon = status === 'SOON';
  const isDeparted = status === 'DEPARTED';
  const dep = meridiemBilingual(service.departure);
  const arr = service.arrival ? meridiemBilingual(service.arrival) : null;
  const isLuxury = service.serviceType === 'LUXURY';
  const isSemiLuxury = service.serviceType === 'SEMI_LUXURY';

  return (
    <article className={`bus-card ${isSoon ? 'soon' : ''} ${isDeparted ? 'departed' : ''}`}>
      <div className="card-top">
        <div className="card-destination">
          <span className="dest-si">{service.destination.si}</span>
          <span className="dest-en">{service.destination.en}</span>
        </div>
        <div className="card-badges">
          {isSoon && <span className="badge soon-badge">ඊළඟ බස් රථය · Next Bus</span>}
          {isDeparted && <span className="badge departed-badge">පිටත් විය</span>}
          <span className={`badge operator-badge ${service.operator.toLowerCase()}`}>
            {service.operator}
          </span>
          {isLuxury && <span className="badge luxury-badge">Luxury</span>}
          {isSemiLuxury && <span className="badge semi-luxury-badge">Semi</span>}
        </div>
      </div>

      <div className="card-middle">
        <div className="time-col departure-col">
          <span className="time-label">පිටත්වීම · Departure</span>
          <div className="time-display">
            <span className="time-digits">{dep.clock}</span>
            <span className="time-meridiem">
              <span className="meridiem-en">{dep.en}</span>
              <span className="meridiem-si">{dep.si}</span>
            </span>
            {dayOffset === 1 && <span className="tomorrow-tag">හෙට · Tomorrow</span>}
          </div>
        </div>

        <div className="time-col arrival-col">
          <span className="time-label">පැමිණීම · Arrival</span>
          <div className="time-display">
            {arr ? (
              <>
                <span className="time-digits secondary">{arr.clock}</span>
                <span className="time-meridiem">
                  <span className="meridiem-en">{arr.en}</span>
                  <span className="meridiem-si">{arr.si}</span>
                </span>
              </>
            ) : (
              <span className="originating-tag">මහියංගනයෙන් අරඹයි (Origin)</span>
            )}
          </div>
        </div>
      </div>

      <div className="card-bottom">
        <div className="origin-row">
          <span className="origin-label">ආරම්භය · From:</span>
          <span className="origin-value">
            {service.origin.si} · {service.origin.en}
          </span>
        </div>
        {service.via && (
          <div className="via-row">
            <span className="via-label">හරහා · Via:</span>
            <span className="via-value">
              {service.via.si} · {service.via.en}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

function SuggestionModal({
  prefilledRoute,
  onClose,
}: {
  prefilledRoute: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>('WRONG_TIME');
  const [routeHint, setRouteHint] = useState(prefilledRoute);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) {
      setError('කරුණාකර අවම වශයෙන් අකුරු 3 ක පණිවිඩයක් ලියන්න. / Please enter at least 3 characters.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          routeHint: routeHint.trim() || undefined,
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      setError(`යැවීම අසාර්ථක විය: ${msg} / Failed to submit. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title-si">වාර්තා කරන්න</h2>
            <div className="modal-title-en">Report an Issue or Suggestion</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {success ? (
          <div className="modal-success">
            <div className="success-icon">✓</div>
            <p className="success-si">ස්තූතියි! ඔබේ වාර්තාව සාර්ථකව ලැබුණි.</p>
            <p className="success-en">Thank you! Your report has been submitted to staff.</p>
            <button type="button" className="modal-btn submit-btn" onClick={onClose}>
              හරි · OK
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label className="form-label">වර්ගය · Category</label>
              <div className="category-grid">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cat-btn ${category === c.id ? 'active' : ''}`}
                    onClick={() => setCategory(c.id)}
                  >
                    <span className="cat-si">{c.si}</span>
                    <span className="cat-en">{c.en}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="route-hint">
                ගමනාන්තය / මාර්ගය · Destination / Route (විකල්ප / Optional)
              </label>
              <input
                id="route-hint"
                type="text"
                className="form-input"
                placeholder="උදා: කොළඹ / Colombo"
                value={routeHint}
                maxLength={100}
                onChange={(e) => setRouteHint(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="sug-message">
                පණිවිඩය · Details (අකුරු 3–500)
              </label>
              <textarea
                id="sug-message"
                className="form-textarea"
                rows={4}
                required
                minLength={3}
                maxLength={500}
                placeholder="වැරදි වේලාව හෝ ගැටලුව සඳහන් කරන්න... / Describe the issue or missing bus..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <span className="char-count">{message.length}/500</span>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn cancel-btn" onClick={onClose}>
                අවලංගු කරන්න · Cancel
              </button>
              <button
                type="submit"
                className="modal-btn submit-btn"
                disabled={submitting || message.trim().length < 3}
              >
                {submitting ? 'යවමින් පවතී... / Submitting...' : 'වාර්තා කරන්න · Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
