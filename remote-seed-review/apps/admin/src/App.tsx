import React, { useEffect, useState, useMemo } from 'react';
import {
  type BusService,
  type ScheduleDocument,
  to12h,
  to24h,
  formatTime12,
  colomboDate,
} from '@bus-schedule/shared';

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

interface ServiceFormData {
  id?: string;
  destSi: string;
  destEn: string;
  originSi: string;
  originEn: string;
  depHour: number;
  depMinute: number;
  depMeridiem: 'AM' | 'PM';
  hasArrival: boolean;
  arrHour: number;
  arrMinute: number;
  arrMeridiem: 'AM' | 'PM';
  operator: 'CTB' | 'PVT';
  serviceType: 'NORMAL' | 'SEMI_LUXURY' | 'LUXURY' | 'EXPRESS';
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  WRONG_TIME: {
    label: 'Wrong Time (වේලාව වැරදියි)',
    color: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  },
  MISSING_BUS: {
    label: 'Missing Bus (බස් රථයක් නැත)',
    color: 'bg-red-900/40 text-red-300 border-red-700/50',
  },
  APP_ISSUE: {
    label: 'App Issue (වෙබ් දෝෂයක්)',
    color: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
  },
  OTHER: {
    label: 'Other (වෙනත්)',
    color: 'bg-slate-800 text-slate-300 border-slate-700',
  },
};

interface StaffUser {
  id: number;
  login_id: string;
  display_name: string;
  role: 'ADMIN' | 'EDITOR';
  disabled: number;
  created_at: string;
  last_login_at: string | null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('Origin', window.location.origin);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, {
    credentials: 'include',
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
  // Navigation & Shell State
  const [activeView, setActiveView] = useState<'timetable' | 'reports' | 'history' | 'users'>('timetable');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Authenticated User & Staff Management State
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    displayName: string;
    role: 'ADMIN' | 'EDITOR';
  } | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingStaffUsers, setLoadingStaffUsers] = useState(false);
  const [staffUsersError, setStaffUsersError] = useState<string | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userFormData, setUserFormData] = useState({
    login_id: '',
    display_name: '',
    role: 'EDITOR' as 'ADMIN' | 'EDITOR',
  });
  const [userFormSaving, setUserFormSaving] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Timetable & Draft Schedule State
  const [services, setServices] = useState<BusService[]>([]);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [liveVersion, setLiveVersion] = useState<number | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [accessConfigured, setAccessConfigured] = useState<boolean | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  // Table Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [operatorFilter, setOperatorFilter] = useState<'ALL' | 'CTB' | 'PVT'>('ALL');

  // Modals & Action State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ServiceFormData>({
    destSi: '',
    destEn: '',
    originSi: 'මහියංගණය',
    originEn: 'Mahiyanganaya',
    depHour: 6,
    depMinute: 0,
    depMeridiem: 'AM',
    hasArrival: false,
    arrHour: 12,
    arrMinute: 0,
    arrMeridiem: 'PM',
    operator: 'PVT',
    serviceType: 'NORMAL',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deletingService, setDeletingService] = useState<BusService | null>(null);
  const [deletingSaving, setDeletingSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Reports & Analytics State (Part 2 Integration)
  const [qrStats, setQrStats] = useState<QrStat[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsTab, setReportsTab] = useState<'all' | 'qr' | 'suggestions'>('all');
  const [suggestionFilter, setSuggestionFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [updatingSuggestionId, setUpdatingSuggestionId] = useState<string | null>(null);

  // TV Reload & Toast Notification State
  const [tvReloading, setTvReloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const todayStr = useMemo(() => colomboDate(), []);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 5000);
  };

  // Load Schedule from D1 Draft (or fallback to /schedule.json)
  async function loadSchedule() {
    setLoadingSchedule(true);
    let loadedFromDraft = false;

    try {
      const res = await apiFetch('/api/draft');
      if (res.ok) {
        const data = (await res.json()) as {
          document: ScheduleDocument;
          draftRevision: number;
          liveVersion: number | null;
          hasUnpublishedChanges: boolean;
        };
        if (data.document?.services) {
          setServices(data.document.services);
          setDraftRevision(data.draftRevision);
          setLiveVersion(data.liveVersion);
          setHasUnpublishedChanges(data.hasUnpublishedChanges);
          setAccessConfigured(true);
          loadedFromDraft = true;
        }
      } else if (res.status === 401 || res.status === 403) {
        setAccessConfigured(false);
      }
    } catch {
      setAccessConfigured(false);
    }

    if (!loadedFromDraft) {
      try {
        const res = await fetch('/schedule.json', { cache: 'no-cache' });
        if (res.ok) {
          const doc = (await res.json()) as ScheduleDocument;
          if (doc.services) {
            setServices(doc.services);
            setLiveVersion(doc.version ?? 1);
            setHasUnpublishedChanges(false);
          }
        }
      } catch (err) {
        console.warn('Failed to load schedule from fallback:', err);
      }
    }
    setLoadingSchedule(false);
  }

  // Load Reports & Analytics Data
  async function loadReportsData() {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const [qrRes, sugRes] = await Promise.all([
        apiFetch('/api/admin/qr-stats'),
        apiFetch('/api/admin/suggestions'),
      ]);

      if (qrRes.ok) {
        const qrData = (await qrRes.json()) as { ok: boolean; stats: QrStat[] };
        if (qrData.ok && Array.isArray(qrData.stats)) setQrStats(qrData.stats);
      }
      if (sugRes.ok) {
        const sugData = (await sugRes.json()) as { ok: boolean; suggestions: Suggestion[] };
        if (sugData.ok && Array.isArray(sugData.suggestions)) setSuggestions(sugData.suggestions);
      }
    } catch (err) {
      setReportsError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setReportsLoading(false);
    }
  }

  // Load Current Authenticated User Info
  async function loadCurrentUser() {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = (await res.json()) as {
          user?: { email: string; displayName: string; role: 'ADMIN' | 'EDITOR' };
        };
        if (data?.user) {
          setCurrentUser(data.user);
          setAccessConfigured(true);
        }
      }
    } catch {
      // In unauthenticated preview mode
    }
  }

  // Load Staff Users List
  async function loadStaffUsers() {
    setLoadingStaffUsers(true);
    setStaffUsersError(null);
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; users: StaffUser[] };
        if (Array.isArray(data.users)) setStaffUsers(data.users);
      } else if (res.status === 403) {
        setStaffUsersError('Administrator role required to view and manage staff members.');
      } else {
        const err = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(
          err?.error?.message || err?.message || `Failed to load staff list (${res.status})`,
        );
      }
    } catch (err) {
      setStaffUsersError(err instanceof Error ? err.message : 'Failed to load staff list');
    } finally {
      setLoadingStaffUsers(false);
    }
  }

  // Copy Admin URL & WhatsApp Link
  function copyAdminLink() {
    const url = 'https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/';
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      });
    }
  }

  // Toggle Staff User Disabled State
  async function handleToggleUserDisabled(u: StaffUser) {
    const isDisabling = u.disabled === 0;
    if (isDisabling) {
      const confirmed = window.confirm(
        `Are you sure you want to disable access for ${u.display_name} (${u.login_id})? They will no longer be able to edit or publish timetables.`,
      );
      if (!confirmed) return;
    }
    setUpdatingUserId(u.id);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: isDisabling ? 1 : 0 }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message || err?.message || `Update failed (${res.status})`);
      }
      showToast(
        isDisabling
          ? `Disabled access for ${u.display_name}`
          : `Re-enabled access for ${u.display_name}`,
      );
      await loadStaffUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setUpdatingUserId(null);
    }
  }

  // Update Staff User Role
  async function handleUpdateUserRole(u: StaffUser, newRole: 'ADMIN' | 'EDITOR') {
    if (u.role === newRole) return;
    setUpdatingUserId(u.id);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message || err?.message || `Update failed (${res.status})`);
      }
      showToast(`Updated ${u.display_name}'s role to ${newRole}`);
      await loadStaffUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user role');
    } finally {
      setUpdatingUserId(null);
    }
  }

  // Add Staff Member
  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setUserFormSaving(true);
    setUserFormError(null);
    try {
      if (!userFormData.login_id.trim() || !userFormData.login_id.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!userFormData.display_name.trim()) {
        throw new Error('Please enter a display name.');
      }
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: userFormData.login_id.trim().toLowerCase(),
          display_name: userFormData.display_name.trim(),
          role: userFormData.role,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message || err?.message || `Failed to add user (${res.status})`);
      }
      showToast(`Added staff member: ${userFormData.display_name}`);
      setIsAddUserModalOpen(false);
      setUserFormData({ login_id: '', display_name: '', role: 'EDITOR' });
      await loadStaffUsers();
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setUserFormSaving(false);
    }
  }

  useEffect(() => {
    void loadCurrentUser();
    void loadSchedule();
    void loadReportsData();
    void loadStaffUsers();
  }, []);

  // Remote TV Reload Trigger
  async function handleTvReload() {
    if (tvReloading) return;
    setTvReloading(true);
    try {
      const res = await apiFetch('/api/admin/tv-reload', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      showToast('TV refresh signal sent — TV will reload within 60s');
    } catch (err) {
      alert(`Error triggering TV reload: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTvReloading(false);
    }
  }

  // Publish Live Action
  async function handlePublish() {
    if (publishing) return;
    setPublishing(true);
    try {
      const res = await apiFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          draftRevision,
          confirm: true,
        }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(
          errData?.error?.message || errData?.message || `Publish failed (${res.status})`,
        );
      }
      showToast('🚀 Timetable published live! TV display and mobile app will update immediately.');
      await loadSchedule();
    } catch (err) {
      if (accessConfigured === false) {
        alert(
          'Cannot publish: Cloudflare Access is unconfigured on this deployment (TEAM_DOMAIN / ACCESS_AUD set to REPLACE_ME).',
        );
      } else {
        alert(err instanceof Error ? err.message : 'Failed to publish live snapshot');
      }
    } finally {
      setPublishing(false);
    }
  }

  // Open Create / Add Modal
  function openAddModal() {
    setFormData({
      destSi: '',
      destEn: '',
      originSi: 'මහියංගණය',
      originEn: 'Mahiyanganaya',
      depHour: 6,
      depMinute: 0,
      depMeridiem: 'AM',
      hasArrival: false,
      arrHour: 12,
      arrMinute: 0,
      arrMeridiem: 'PM',
      operator: 'PVT',
      serviceType: 'NORMAL',
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  // Open Edit / Update Modal
  function openEditModal(service: BusService) {
    const dep = to12h(service.departure);
    const arr = service.arrival ? to12h(service.arrival) : null;
    setFormData({
      id: service.id,
      destSi: service.destination.si,
      destEn: service.destination.en,
      originSi: service.origin.si,
      originEn: service.origin.en,
      depHour: dep.hour,
      depMinute: Number(dep.minute),
      depMeridiem: dep.meridiem,
      hasArrival: Boolean(service.arrival),
      arrHour: arr ? arr.hour : 12,
      arrMinute: arr ? Number(arr.minute) : 0,
      arrMeridiem: arr ? arr.meridiem : 'PM',
      operator: service.operator,
      serviceType: service.serviceType,
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  // Save Bus Service (Create / Update)
  async function handleSaveBus(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.destSi.trim() || !formData.destEn.trim()) {
      setFormError('Please provide both Sinhala and English destination names.');
      return;
    }
    if (!formData.originSi.trim() || !formData.originEn.trim()) {
      setFormError('Please provide both Sinhala and English origin names.');
      return;
    }

    const depTime = to24h(formData.depHour, formData.depMinute, formData.depMeridiem);
    const arrTime = formData.hasArrival
      ? to24h(formData.arrHour, formData.arrMinute, formData.arrMeridiem)
      : null;

    const payload = {
      destination: { si: formData.destSi.trim(), en: formData.destEn.trim() },
      origin: { si: formData.originSi.trim(), en: formData.originEn.trim() },
      departure: depTime,
      arrival: arrTime,
      operator: formData.operator,
      serviceType: formData.serviceType,
      via: null,
      tripStart: null,
      destinationArrival: null,
      bay: null,
      days: [1, 2, 3, 4, 5, 6, 7],
      active: true,
    };

    setFormSaving(true);
    setFormError(null);

    try {
      const isEdit = Boolean(formData.id);
      const url = isEdit ? `/api/draft/services/${formData.id}` : '/api/draft/services';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(
          errData?.error?.message || errData?.message || `Server returned ${res.status}`,
        );
      }

      setIsModalOpen(false);
      showToast(isEdit ? 'Bus service updated in draft!' : 'New bus service added to draft!');
      await loadSchedule();
    } catch (err) {
      if (accessConfigured === false) {
        setFormError(
          'Cannot save: Cloudflare Access is not configured on this Worker deployment. Please set TEAM_DOMAIN and ACCESS_AUD in wrangler.toml to enable live D1 draft editing.',
        );
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to save bus service');
      }
    } finally {
      setFormSaving(false);
    }
  }

  // Delete Bus Service
  async function handleDeleteBus() {
    if (!deletingService) return;
    setDeletingSaving(true);
    try {
      const res = await apiFetch(`/api/draft/services/${deletingService.id}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(
          errData?.error?.message || errData?.message || `Server returned ${res.status}`,
        );
      }
      setDeletingService(null);
      showToast('Bus service deleted from draft.');
      await loadSchedule();
    } catch (err) {
      if (accessConfigured === false) {
        alert(
          'Cannot delete: Cloudflare Access is unconfigured on this deployment. Please configure TEAM_DOMAIN and ACCESS_AUD.',
        );
      } else {
        alert(err instanceof Error ? err.message : 'Failed to delete bus service');
      }
    } finally {
      setDeletingSaving(false);
    }
  }

  // Update Suggestion Status (Part 2)
  async function handleUpdateSuggestionStatus(id: string, status: 'OPEN' | 'RESOLVED') {
    setUpdatingSuggestionId(id);
    try {
      const res = await apiFetch(`/api/admin/suggestions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    } catch (err) {
      alert(`Failed to update status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpdatingSuggestionId(null);
    }
  }

  // Filtered & Chronologically Sorted Services
  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => a.departure.localeCompare(b.departure));
  }, [services]);

  const filteredServices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return sortedServices.filter((s) => {
      const matchesOperator = operatorFilter === 'ALL' || s.operator === operatorFilter;
      if (!matchesOperator) return false;
      if (!query) return true;
      return (
        s.destination.en.toLowerCase().includes(query) ||
        s.destination.si.includes(query) ||
        s.origin.en.toLowerCase().includes(query) ||
        s.origin.si.includes(query)
      );
    });
  }, [sortedServices, searchTerm, operatorFilter]);

  const ctbCount = useMemo(() => services.filter((s) => s.operator === 'CTB').length, [services]);
  const pvtCount = useMemo(() => services.filter((s) => s.operator === 'PVT').length, [services]);

  // Analytics Metrics
  const todayStats = useMemo(() => {
    return (
      qrStats.find((s) => s.scan_date === todayStr) || {
        scan_date: todayStr,
        unique_visitors: 0,
        total_scans: 0,
      }
    );
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-xl bg-slate-900 border border-emerald-500/50 shadow-2xl text-emerald-200 text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hamburger Navigation Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sliding Left Navigation Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col justify-between ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🚌</span>
              <div>
                <div className="text-sm font-bold text-white leading-tight">Admin Console</div>
                <div className="text-[11px] text-slate-400">Mahiyanganaya Stand</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close Drawer"
            >
              ✕
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveView('timetable');
                setDrawerOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeView === 'timetable'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🕒</span>
                <span>Bus Timetable</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 font-mono">
                {services.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('reports');
                setDrawerOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeView === 'reports'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📊</span>
                <span>Reports & Analytics</span>
              </div>
              {openSuggestionsCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold">
                  {openSuggestionsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('history');
                setDrawerOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeView === 'history'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🚀</span>
                <span>Publish & History</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 font-mono">
                v{liveVersion ?? 1}
              </span>
            </button>

            {(!currentUser || currentUser.role === 'ADMIN') && (
              <button
                type="button"
                onClick={() => {
                  setActiveView('users');
                  setDrawerOpen(false);
                  void loadStaffUsers();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                  activeView === 'users'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">👥</span>
                  <span>Staff & Users</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 font-mono">
                  {staffUsers.length}
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Drawer Footer System Status */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>D1 Database:</span>
            <span className="text-emerald-400 font-mono font-medium">Connected</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Live TV Snapshot:</span>
            <span className="text-slate-200 font-mono">v{liveVersion ?? 1}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Access Auth:</span>
            <span
              className={
                accessConfigured === false
                  ? 'text-amber-400'
                  : accessConfigured === true
                    ? 'text-emerald-400'
                    : 'text-slate-400'
              }
            >
              {accessConfigured === false
                ? 'Unconfigured (Dev)'
                : accessConfigured === true
                  ? 'Active'
                  : 'Checking...'}
            </span>
          </div>
          {currentUser && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-slate-400">
              <span>Staff Login:</span>
              <span
                className="text-blue-400 font-mono truncate max-w-[140px]"
                title={currentUser.email}
              >
                {currentUser.displayName || currentUser.email} ({currentUser.role})
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Hamburger Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700 transition"
              title="Open Navigation Menu"
            >
              <span className="text-lg block leading-none">☰</span>
            </button>

            <div>
              <h1 className="text-base md:text-lg font-bold text-white tracking-tight leading-tight">
                Mahiyanganaya Bus Timetable — Admin
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                මහියංගන දුර ගමන් බස් රථ ධාවන කාලසටහන — පරිපාලන පුවරුව
              </p>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleTvReload}
              disabled={tvReloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition disabled:opacity-50"
              title="Trigger immediate reload on all wall display TVs"
            >
              <span>📺</span>
              <span className="hidden sm:inline">Refresh TV Display</span>
              <span className="sm:hidden">Refresh TV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-6 space-y-6">
        {/* Unpublished Changes Banner */}
        {hasUnpublishedChanges && (
          <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-500/60 text-amber-200 flex flex-wrap items-center justify-between gap-4 shadow-lg animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-bold text-white">Unpublished Draft Changes</div>
                <div className="text-xs text-amber-300/90">
                  You have unsaved edits in the draft schedule that are not yet visible on the TV
                  wall board or passenger mobile app.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <span>🚀</span>
              {publishing ? 'Publishing Live...' : 'Publish Live Now'}
            </button>
          </div>
        )}

        {/* Cloudflare Access Status Banner (when unconfigured in dev/workers.dev) */}
        {!currentUser && accessConfigured === false && (
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/30 text-amber-200/90 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">ℹ️</span>
              <span>
                <strong>Cloudflare Access Guard:</strong> Running in read-only / preview mode
                because <code>TEAM_DOMAIN</code> and <code>ACCESS_AUD</code> are set to default
                placeholders. Schedule entries are loaded from <code>/schedule.json</code>.
              </span>
            </div>
          </div>
        )}

        {/* VIEW 1: BUS TIMETABLE */}
        {activeView === 'timetable' && (
          <section className="space-y-5">
            {/* Table Control Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Input */}
                <div className="relative min-w-[260px] sm:min-w-[320px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search destination or origin (e.g. Colombo, කොළඹ)..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Operator Filter Chips */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setOperatorFilter('ALL')}
                    className={`px-3 py-1 rounded-lg transition ${
                      operatorFilter === 'ALL'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({services.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperatorFilter('CTB')}
                    className={`px-3 py-1 rounded-lg transition ${
                      operatorFilter === 'CTB'
                        ? 'bg-red-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    CTB ({ctbCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperatorFilter('PVT')}
                    className={`px-3 py-1 rounded-lg transition ${
                      operatorFilter === 'PVT'
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    PVT ({pvtCount})
                  </button>
                </div>
              </div>

              {/* + Create / Add Bus Primary Button */}
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition self-start md:self-auto"
              >
                <span className="text-base leading-none">+</span>
                <span>Create / Add Bus</span>
              </button>
            </div>

            {/* Schedule Table Container */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="px-4 py-3.5">ගමනාන්තය / Destination</th>
                      <th className="px-4 py-3.5">පිටත්වන වේලාව / Departure</th>
                      <th className="px-4 py-3.5">පැමිණෙන වේලාව / Arrival</th>
                      <th className="px-4 py-3.5">ගමනාරම්භය / From</th>
                      <th className="px-4 py-3.5">සේවා වර්ගය / Service</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingSchedule ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          <span className="inline-block animate-spin mr-2">🔄</span> Loading bus
                          schedule...
                        </td>
                      </tr>
                    ) : filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          No bus services found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((bus) => (
                        <tr
                          key={bus.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* 1. Destination */}
                          <td className="px-4 py-3 text-white">
                            <div className="font-semibold text-slate-100 text-[13px]">
                              {bus.destination.si}
                            </div>
                            <div className="text-[11px] text-slate-400 font-sans">
                              {bus.destination.en}
                            </div>
                          </td>

                          {/* 2. Departure */}
                          <td className="px-4 py-3 font-mono font-bold text-amber-400 text-[13px]">
                            {formatTime12(bus.departure, 'EN')}
                          </td>

                          {/* 3. Arrival */}
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {bus.arrival ? (
                              formatTime12(bus.arrival, 'EN')
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* 4. From / Origin */}
                          <td className="px-4 py-3 text-slate-300">
                            <div className="text-[12px]">{bus.origin.si}</div>
                            <div className="text-[10px] text-slate-400 font-sans">
                              {bus.origin.en}
                            </div>
                          </td>

                          {/* 5. Service Type */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-md ${
                                bus.operator === 'CTB'
                                  ? 'bg-red-950 text-red-300 border border-red-800/70'
                                  : 'bg-blue-950 text-blue-300 border border-blue-800/70'
                              }`}
                            >
                              {bus.operator}
                            </span>
                            {bus.serviceType && bus.serviceType !== 'NORMAL' && (
                              <span className="ml-1.5 text-[10px] text-slate-400">
                                {bus.serviceType === 'SEMI_LUXURY'
                                  ? 'Semi-Luxury'
                                  : bus.serviceType}
                              </span>
                            )}
                          </td>

                          {/* 6. Actions */}
                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(bus)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                            >
                              ✏️ Update
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingService(bus)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 transition"
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 flex items-center justify-between">
                <span>
                  Showing {filteredServices.length} of {services.length} services
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  Chronologically ordered by departure
                </span>
              </div>
            </div>
          </section>
        )}

        {/* VIEW 2: REPORTS & ANALYTICS (Part 2) */}
        {activeView === 'reports' && (
          <section className="space-y-8">
            {/* Section Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportsTab('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    reportsTab === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Overview & All
                </button>
                <button
                  type="button"
                  onClick={() => setReportsTab('qr')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    reportsTab === 'qr'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📱 QR Analytics
                </button>
                <button
                  type="button"
                  onClick={() => setReportsTab('suggestions')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    reportsTab === 'suggestions'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ⚠️ Passenger Suggestions ({openSuggestionsCount})
                </button>
              </div>

              <button
                type="button"
                onClick={loadReportsData}
                disabled={reportsLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
              >
                {reportsLoading ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>

            {reportsError && (
              <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-200 text-xs">
                ⚠️ {reportsError}
              </div>
            )}

            {/* QR METRICS */}
            {(reportsTab === 'all' || reportsTab === 'qr') && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs uppercase text-slate-400 font-semibold">
                      Today's Unique Visitors
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {todayStats.unique_visitors}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Distinct mobile devices</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs uppercase text-slate-400 font-semibold">
                      Today's Total Scans
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {todayStats.total_scans}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Total QR redirects today</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs uppercase text-slate-400 font-semibold">
                      All-Time Unique Scans
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">{allTimeUniqueScans}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Across all recorded days ({allTimeTotalScans} total)
                    </div>
                  </div>
                </div>

                {/* QR History Table */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="p-3.5 border-b border-slate-800 text-xs font-bold text-white uppercase">
                    Daily Scan History (Last 90 Days)
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 sticky top-0">
                        <tr>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Unique Visitors</th>
                          <th className="px-4 py-2">Total Scans</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {qrStats.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                              No scan records yet.
                            </td>
                          </tr>
                        ) : (
                          qrStats.map((stat) => (
                            <tr key={stat.scan_date} className="hover:bg-slate-800/40">
                              <td className="px-4 py-2 font-mono">{stat.scan_date}</td>
                              <td className="px-4 py-2 font-bold text-blue-400">
                                {stat.unique_visitors}
                              </td>
                              <td className="px-4 py-2 text-slate-300">{stat.total_scans}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUGGESTIONS SECTION */}
            {(reportsTab === 'all' || reportsTab === 'suggestions') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Passenger Suggestions & Reports
                    </h3>
                    <p className="text-xs text-slate-400">
                      Feedback submitted by passengers through <code>/mobile/</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setSuggestionFilter('ALL')}
                      className={`px-2.5 py-1 rounded ${
                        suggestionFilter === 'ALL'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({suggestions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestionFilter('OPEN')}
                      className={`px-2.5 py-1 rounded ${
                        suggestionFilter === 'OPEN'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Open ({openSuggestionsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestionFilter('RESOLVED')}
                      className={`px-2.5 py-1 rounded ${
                        suggestionFilter === 'RESOLVED'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Resolved ({suggestions.length - openSuggestionsCount})
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="px-4 py-2.5">Date / Time</th>
                          <th className="px-4 py-2.5">Category</th>
                          <th className="px-4 py-2.5">Route</th>
                          <th className="px-4 py-2.5">Message</th>
                          <th className="px-4 py-2.5 text-right">Status / Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredSuggestions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                              No suggestions match this filter.
                            </td>
                          </tr>
                        ) : (
                          filteredSuggestions.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-800/40">
                              <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                                {formatDate(item.created_at)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                    CATEGORY_LABELS[item.category]?.color || 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {CATEGORY_LABELS[item.category]?.label || item.category}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-200">
                                {item.route_hint || <span className="text-slate-600">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-slate-300 max-w-xs break-words">
                                {item.message}
                              </td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {item.status === 'OPEN' ? (
                                  <button
                                    type="button"
                                    disabled={updatingSuggestionId === item.id}
                                    onClick={() =>
                                      handleUpdateSuggestionStatus(item.id, 'RESOLVED')
                                    }
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                                  >
                                    ✓ Resolve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={updatingSuggestionId === item.id}
                                    onClick={() => handleUpdateSuggestionStatus(item.id, 'OPEN')}
                                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition disabled:opacity-50"
                                  >
                                    Reopen
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* VIEW 3: PUBLISH & HISTORY (Part 3 Placeholder) */}
        {activeView === 'history' && (
          <section className="space-y-6 max-w-4xl">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🚀</span>
                <div>
                  <h2 className="text-lg font-bold text-white">Publish & Snapshot History</h2>
                  <p className="text-xs text-slate-400">
                    Immutable snapshots, rollback versioning, and deployment audit trail
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Live Snapshot Version</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    v{liveVersion ?? 1}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Draft Revision</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">
                    rev {draftRevision ?? 0}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Pending Changes</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">
                    {hasUnpublishedChanges ? 'Yes' : 'None'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-2">
                <div className="font-semibold text-white">Snapshot System Overview:</div>
                <p>
                  Every time staff members publish, the Cloudflare Worker takes an immutable
                  snapshot and assigns it an incremental version number. If an erroneous change is
                  published, any previous snapshot can be instantly restored via rollback.
                </p>
                <p className="text-slate-400">
                  Full snapshot comparison diffs and one-click rollback will be available in Part 3.
                </p>
              </div>

              {hasUnpublishedChanges && (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition inline-flex items-center gap-2"
                >
                  <span>🚀</span>
                  {publishing ? 'Publishing...' : 'Publish Current Draft Live'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* 4. STAFF & USERS VIEW */}
        {activeView === 'users' && (
          <section className="space-y-6">
            {/* Two-Step Access Reminder Banner */}
            <div className="bg-gradient-to-r from-blue-950/70 to-slate-900 border border-blue-800/60 rounded-2xl p-5 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <span className="text-2xl mt-0.5" aria-hidden="true">
                    ℹ️
                  </span>
                  <div className="space-y-1.5">
                    <h3 className="font-bold text-white text-base">Two-Step Access Reminder:</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      <strong className="text-white">1.</strong> Add the person&apos;s email here so
                      they have Admin/Editor permissions.
                      <br />
                      <strong className="text-white">2.</strong> Also add their email to the{' '}
                      <strong className="text-blue-300 font-semibold">MBT Staff</strong> policy in
                      Cloudflare Zero Trust so they can receive the 6-digit login PIN.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-auto">
                  <button
                    type="button"
                    onClick={copyAdminLink}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
                  >
                    <span>{copiedLink ? '✓ Copied URL' : '📋 Copy Admin URL'}</span>
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      'Mahiyanganaya Bus Timetable Admin Portal: https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/',
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
                  >
                    <span>💬 WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Staff Header & Action Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Staff & Portal Users</h2>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 font-mono">
                    {staffUsers.length}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage staff roles and access authorization for the Mahiyanganaya Timetable Portal.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => void loadStaffUsers()}
                  disabled={loadingStaffUsers}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition inline-flex items-center gap-1.5"
                >
                  <span className={loadingStaffUsers ? 'animate-spin' : ''}>🔄</span>
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserFormData({ login_id: '', display_name: '', role: 'EDITOR' });
                    setUserFormError(null);
                    setIsAddUserModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition inline-flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Add Staff / Admin</span>
                </button>
              </div>
            </div>

            {/* Error banner if any */}
            {staffUsersError && (
              <div className="p-4 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-xs">
                ⚠️ {staffUsersError}
              </div>
            )}

            {/* Staff Users Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Name & Email</th>
                      <th className="py-3.5 px-4">Role</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Last Login</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {loadingStaffUsers && staffUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <span className="animate-spin text-lg">⏳</span>
                            <span>Loading staff users...</span>
                          </div>
                        </td>
                      </tr>
                    ) : staffUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          No registered staff users found in D1 database.
                        </td>
                      </tr>
                    ) : (
                      staffUsers.map((u) => {
                        const isSelf =
                          currentUser?.email &&
                          u.login_id.toLowerCase() === currentUser.email.toLowerCase();
                        const isUpdating = updatingUserId === u.id;

                        return (
                          <tr
                            key={u.id}
                            className={`hover:bg-slate-800/40 transition ${
                              u.disabled ? 'opacity-60 bg-slate-950/20' : ''
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">
                                  {u.display_name}
                                </span>
                                {isSelf && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-slate-400 text-xs mt-0.5">
                                {u.login_id}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              {isSelf ? (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-700/60">
                                  ADMIN
                                </span>
                              ) : (
                                <select
                                  value={u.role}
                                  disabled={isUpdating}
                                  onChange={(e) =>
                                    void handleUpdateUserRole(
                                      u,
                                      e.target.value as 'ADMIN' | 'EDITOR',
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="EDITOR">EDITOR</option>
                                </select>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              {u.disabled === 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-950/80 text-red-300 border border-red-700/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Disabled
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                              {u.last_login_at ? formatDate(u.last_login_at) : 'Never'}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {isSelf ? (
                                <span className="text-[11px] text-slate-500 italic">
                                  Active Session
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => void handleToggleUserDisabled(u)}
                                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                                    u.disabled === 0
                                      ? 'bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60'
                                      : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60'
                                  }`}
                                >
                                  {isUpdating
                                    ? 'Updating...'
                                    : u.disabled === 0
                                      ? 'Disable'
                                      : 'Re-enable'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* CREATE / UPDATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{formData.id ? '✏️' : '🚌'}</span>
                <h3 className="text-base font-bold text-white">
                  {formData.id ? 'Update Bus Service' : 'Create / Add Bus Service'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveBus} className="p-6 space-y-5 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-700/60 text-red-200 text-xs">
                  ⚠️ {formError}
                </div>
              )}

              {/* 1. Destination (Sinhala & English) */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Destination (ගමනාන්තය) *
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Sinhala (සිංහල)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., කොළඹ"
                      value={formData.destSi}
                      onChange={(e) => setFormData({ ...formData, destSi: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      English (English)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Colombo"
                      value={formData.destEn}
                      onChange={(e) => setFormData({ ...formData, destEn: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. From / Origin (Sinhala & English) */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  From / Origin (ගමනාරම්භය) *
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Sinhala (සිංහල)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., මහියංගණය"
                      value={formData.originSi}
                      onChange={(e) => setFormData({ ...formData, originSi: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      English (English)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Mahiyanganaya"
                      value={formData.originEn}
                      onChange={(e) => setFormData({ ...formData, originEn: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Departure Time Picker */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Departure Time (පිටත්වන වේලාව) *
                </div>
                <div className="flex items-center gap-2">
                  {/* Hour */}
                  <select
                    value={formData.depHour}
                    onChange={(e) =>
                      setFormData({ ...formData, depHour: Number(e.target.value) })
                    }
                    className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 font-mono"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold">:</span>
                  {/* Minute */}
                  <select
                    value={formData.depMinute}
                    onChange={(e) =>
                      setFormData({ ...formData, depMinute: Number(e.target.value) })
                    }
                    className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 font-mono"
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  {/* AM / PM */}
                  <select
                    value={formData.depMeridiem}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        depMeridiem: e.target.value as 'AM' | 'PM',
                      })
                    }
                    className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-amber-400 font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="AM">AM (පෙ.ව.)</option>
                    <option value="PM">PM (ප.ව.)</option>
                  </select>
                </div>
              </div>

              {/* 4. Arrival Time (Optional) */}
              <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Arrival Time (පැමිණෙන වේලාව — Optional)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.hasArrival}
                      onChange={(e) =>
                        setFormData({ ...formData, hasArrival: e.target.checked })
                      }
                      className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>Has Arrival Time</span>
                  </label>
                </div>

                {formData.hasArrival ? (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <select
                      value={formData.arrHour}
                      onChange={(e) =>
                        setFormData({ ...formData, arrHour: Number(e.target.value) })
                      }
                      className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 font-mono"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-400 font-bold">:</span>
                    <select
                      value={formData.arrMinute}
                      onChange={(e) =>
                        setFormData({ ...formData, arrMinute: Number(e.target.value) })
                      }
                      className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 font-mono"
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formData.arrMeridiem}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          arrMeridiem: e.target.value as 'AM' | 'PM',
                        })
                      }
                      className="px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-bold focus:outline-none focus:border-blue-500"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">No arrival time / —</div>
                )}
              </div>

              {/* 5. Service Type & Operator */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-800/80">
                <div>
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    Operator (ක්‍රියාකරු) *
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, operator: 'PVT' })}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                        formData.operator === 'PVT'
                          ? 'bg-blue-600 border-blue-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      PVT (Private)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, operator: 'CTB' })}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                        formData.operator === 'CTB'
                          ? 'bg-red-700 border-red-600 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      CTB (ලංගම)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    Comfort Tier (සේවා වර්ගය)
                  </label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        serviceType: e.target.value as ServiceFormData['serviceType'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="NORMAL">Normal (සාමාන්‍ය)</option>
                    <option value="SEMI_LUXURY">Semi-Luxury (අර්ධ සුඛෝපභෝගී)</option>
                    <option value="LUXURY">Luxury (සුඛෝපභෝගී)</option>
                    <option value="EXPRESS">Express (එක්ස්ප්‍රස්)</option>
                  </select>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={formSaving}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow transition disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : formData.id ? 'Save Changes' : '+ Add Bus Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-red-900/60 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-base font-bold text-white">Delete Bus Service</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete this bus entry?
            </p>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Destination:</span>
                <span className="font-bold text-white">
                  {deletingService.destination.si} / {deletingService.destination.en}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Departure:</span>
                <span className="font-mono font-bold text-amber-400">
                  {formatTime12(deletingService.departure, 'EN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">From / Origin:</span>
                <span className="text-slate-200">
                  {deletingService.origin.si} / {deletingService.origin.en}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Operator:</span>
                <span
                  className={`font-bold ${
                    deletingService.operator === 'CTB' ? 'text-red-400' : 'text-blue-400'
                  }`}
                >
                  {deletingService.operator}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-amber-300/80">
              This bus will be removed from the draft schedule. Remember to click &quot;Publish Live
              Now&quot; to apply changes to the wall TV.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingService(null)}
                disabled={deletingSaving}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBus}
                disabled={deletingSaving}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow transition disabled:opacity-50"
              >
                {deletingSaving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD STAFF / ADMIN MODAL */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">👤</span>
                <h3 className="text-base font-bold text-white">Add Staff / Administrator</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {userFormError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-700/60 text-red-200 text-xs">
                  ⚠️ {userFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Email Address (<span className="font-mono text-slate-400">login_id</span>) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g., staffmember@gmail.com"
                  value={userFormData.login_id}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, login_id: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Display Name (<span className="font-mono text-slate-400">display_name</span>) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Kamal Perera"
                  value={userFormData.display_name}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, display_name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Access Role (<span className="font-mono text-slate-400">role</span>) *
                </label>
                <select
                  value={userFormData.role}
                  onChange={(e) =>
                    setUserFormData({
                      ...userFormData,
                      role: e.target.value as 'ADMIN' | 'EDITOR',
                    })
                  }
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="EDITOR">EDITOR — (Can add/edit/publish bus schedules only)</option>
                  <option value="ADMIN">ADMIN — (Full access + manage staff)</option>
                </select>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 leading-relaxed">
                💡 <strong className="text-slate-300">Note:</strong> After adding the email here,
                ensure it is also added to the <strong className="text-blue-300">MBT Staff</strong> policy in
                Cloudflare Zero Trust so Cloudflare sends them the 6-digit login PIN.
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={userFormSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition disabled:opacity-60"
                >
                  {userFormSaving ? 'Adding...' : 'Add Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
