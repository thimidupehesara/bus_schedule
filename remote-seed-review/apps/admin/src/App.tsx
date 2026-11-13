import { useEffect, useState, useMemo } from 'react';
import { colomboDate } from '@bus-schedule/shared';

interface QrStat {
  scan_date: string;
  unique_visitors: number;
  total_scans: number;
}

interface Suggestion {
  id: string;
  created_at: string;
  category: 'WRONG_TIME' | 'MISSING_BUS' | 'APP_ISSUE' | 'OTHER';
  route_hint: string | null;
  message: string;
  status: 'OPEN' | 'RESOLVED';
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  WRONG_TIME: { label: 'Wrong Time (වේලාව වැරදියි)', color: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  MISSING_BUS: { label: 'Missing Bus (බස් රථයක් නැත)', color: 'bg-red-900/40 text-red-300 border-red-700/50' },
  APP_ISSUE: { label: 'App Issue (වෙබ් දෝෂයක්)', color: 'bg-purple-900/40 text-purple-300 border-purple-700/50' },
  OTHER: { label: 'Other (වෙනත්)', color: 'bg-slate-800 text-slate-300 border-slate-700' },
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('Origin', window.location.origin);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, {
    ...options,
    headers,
  });
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function App() {
  const [qrStats, setQrStats] = useState<QrStat[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'qr' | 'suggestions'>('all');
  const [suggestionFilter, setSuggestionFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const todayStr = useMemo(() => colomboDate(), []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [qrRes, sugRes] = await Promise.all([
        apiFetch('/api/admin/qr-stats'),
        apiFetch('/api/admin/suggestions'),
      ]);

      if (!qrRes.ok) throw new Error(`QR Stats HTTP ${qrRes.status}`);
      if (!sugRes.ok) throw new Error(`Suggestions HTTP ${sugRes.status}`);

      const qrData = (await qrRes.json()) as { ok: boolean; stats: QrStat[] };
      const sugData = (await sugRes.json()) as { ok: boolean; suggestions: Suggestion[] };

      if (qrData.ok && Array.isArray(qrData.stats)) {
        setQrStats(qrData.stats);
      }
      if (sugData.ok && Array.isArray(sugData.suggestions)) {
        setSuggestions(sugData.suggestions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleUpdateStatus(id: string, newStatus: 'OPEN' | 'RESOLVED') {
    setUpdatingId(id);
    try {
      const res = await apiFetch(`/api/admin/suggestions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (!res.ok || !data.ok) {
        throw new Error(`Update failed: HTTP ${res.status}`);
      }
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update suggestion status');
    } finally {
      setUpdatingId(null);
    }
  }

  // Calculate metrics
  const todayStats = useMemo(() => {
    return qrStats.find((s) => s.scan_date === todayStr) || {
      scan_date: todayStr,
      unique_visitors: 0,
      total_scans: 0,
    };
  }, [qrStats, todayStr]);

  const allTimeUniqueScans = useMemo(() => {
    return qrStats.reduce((sum, s) => sum + (s.unique_visitors || 0), 0);
  }, [qrStats]);

  const allTimeTotalScans = useMemo(() => {
    return qrStats.reduce((sum, s) => sum + (s.total_scans || 0), 0);
  }, [qrStats]);

  const openSuggestionsCount = useMemo(() => {
    return suggestions.filter((s) => s.status === 'OPEN').length;
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    if (suggestionFilter === 'ALL') return suggestions;
    return suggestions.filter((s) => s.status === suggestionFilter);
  }, [suggestions, suggestionFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚌</span>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Mahiyanganaya Bus Stand — Staff Admin Portal
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              මහියංගන දුර ගමන් බස් රථ ධාවන කාලසටහන — පරිපාලන පුවරුව
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
              title="Refresh Analytics and Suggestions"
            >
              <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>🔄</span>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-10">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Overview & All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'qr'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            📊 QR Visitor Analytics
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suggestions')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'suggestions'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            ⚠️ Passenger Suggestions
            {openSuggestionsCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-slate-950">
                {openSuggestionsCount}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              type="button"
              onClick={loadData}
              className="underline font-semibold hover:text-white text-xs"
            >
              Try Again
            </button>
          </div>
        )}

        {/* 1. QR VISITOR ANALYTICS SECTION */}
        {(activeTab === 'all' || activeTab === 'qr') && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📱</span> Daily QR Code Visitor Analytics
                </h2>
                <p className="text-xs text-slate-400">
                  Privacy-safe counts from the TV wall timetable QR code pointing to <code>/qr</code>
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-mono">
                Today: {todayStr} (Sri Lanka)
              </span>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Today's Unique Visitors */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Today's Unique Visitors
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-blue-400">
                    {todayStats.unique_visitors.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">phones today</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Deduplicated via SHA-256 IP salt hashing
                </p>
                <div className="absolute right-4 top-4 text-3xl opacity-10">👥</div>
              </div>

              {/* Card 2: Today's Total Scans */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Today's Total Scans
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-emerald-400">
                    {todayStats.total_scans.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">total scans</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Every redirect from /qr to /mobile/
                </p>
                <div className="absolute right-4 top-4 text-3xl opacity-10">📲</div>
              </div>

              {/* Card 3: All-Time Unique Visitors */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  All-Time Unique Scans
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-amber-400">
                    {allTimeUniqueScans.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({allTimeTotalScans.toLocaleString()} total)
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Across all {qrStats.length} recorded days
                </p>
                <div className="absolute right-4 top-4 text-3xl opacity-10">📈</div>
              </div>
            </div>

            {/* Daily History Table */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Daily History Breakdown</h3>
                <span className="text-xs text-slate-400">{qrStats.length} days recorded</span>
              </div>

              {qrStats.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No QR scans recorded yet. Commuters who scan the wall TV QR code will show here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Date (YYYY-MM-DD)</th>
                        <th className="px-5 py-3.5">Unique Visitors (Phones)</th>
                        <th className="px-5 py-3.5">Total Scans</th>
                        <th className="px-5 py-3.5 text-right">Avg Scans/Visitor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {qrStats.map((row) => {
                        const isToday = row.scan_date === todayStr;
                        const avg =
                          row.unique_visitors > 0
                            ? (row.total_scans / row.unique_visitors).toFixed(1)
                            : '0';
                        return (
                          <tr
                            key={row.scan_date}
                            className={`hover:bg-slate-800/40 transition ${
                              isToday ? 'bg-blue-950/20' : ''
                            }`}
                          >
                            <td className="px-5 py-3.5 font-mono text-slate-200 flex items-center gap-2">
                              {row.scan_date}
                              {isToday && (
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                  Today
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-semibold text-blue-300">
                              {row.unique_visitors.toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5 text-emerald-300 font-semibold">
                              {row.total_scans.toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5 text-right text-slate-400 font-mono">
                              {avg}x
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 2. PASSENGER SUGGESTIONS / ISSUE REPORTS SECTION */}
        {(activeTab === 'all' || activeTab === 'suggestions') && (
          <section className="space-y-6 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>⚠️</span> Passenger Suggestions & Issue Reports
                </h2>
                <p className="text-xs text-slate-400">
                  Reports submitted by passengers using the ⚠️ button on <code>/mobile/</code>
                </p>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSuggestionFilter('ALL')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    suggestionFilter === 'ALL'
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({suggestions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestionFilter('OPEN')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    suggestionFilter === 'OPEN'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Open ({openSuggestionsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestionFilter('RESOLVED')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    suggestionFilter === 'RESOLVED'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Resolved ({suggestions.length - openSuggestionsCount})
                </button>
              </div>
            </div>

            {/* Suggestions Table */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
              {filteredSuggestions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  <div className="text-3xl mb-2">✨</div>
                  <p className="font-semibold text-slate-400">No suggestions in this view</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Submitted issues and schedule change suggestions will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Date / Time (SL)</th>
                        <th className="px-5 py-3.5">Category</th>
                        <th className="px-5 py-3.5">Route / Destination</th>
                        <th className="px-5 py-3.5">Passenger Message</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredSuggestions.map((item) => {
                        const isOpen = item.status === 'OPEN';
                        const cat =
                          CATEGORY_LABELS[item.category] || CATEGORY_LABELS['OTHER'];
                        const isUpdating = updatingId === item.id;

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-800/40 transition ${
                              isOpen ? 'bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="px-5 py-4 font-mono text-xs text-slate-300 whitespace-nowrap">
                              {formatDate(item.created_at)}
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-md border ${cat!.color}`}
                              >
                                {cat!.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-medium text-slate-200 whitespace-nowrap">
                              {item.route_hint ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
                                  📍 {item.route_hint}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-slate-200 max-w-md">
                              <p className="whitespace-pre-wrap break-words leading-relaxed text-xs sm:text-sm">
                                {item.message}
                              </p>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              {isOpen ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  ● OPEN
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  ✓ RESOLVED
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right whitespace-nowrap">
                              {isOpen ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(item.id, 'RESOLVED')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                                >
                                  {isUpdating ? 'Saving...' : '✓ Mark Resolved'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(item.id, 'OPEN')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
                                >
                                  {isUpdating ? 'Saving...' : 'Reopen'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
