import { normalizeTime, resolveTownPair, detectColumns, parseJsonServices, parseSpreadsheet, columnLabels } from './import-timetable';
import React, { useEffect, useRef, useState, useMemo, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  type BusService,
  type ScheduleDocument,
  type DisplaySettings,
  type AlertBanner,
  type Weekday,
  DEFAULT_DISPLAY_SETTINGS,
  to12h,
  to24h,
  formatTime12,
  minutes,
  colomboDate,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  KNOWN_PLACES,
  LABELS,
  type FrequentServicesConfig,
  DEFAULT_FREQUENT_SERVICES_CONFIG,
} from '@bus-schedule/shared';

// ---------------------------------------------------------------------------
// Error Boundary (Prevents White-Screen Crashes)
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-slate-900 border border-rose-800 text-rose-200 shadow-xl space-y-4 my-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="text-base font-bold text-white">
                {this.props.fallbackTitle || 'A rendering error occurred'}
              </h3>
              <p className="text-xs text-rose-300 mt-1">
                {this.state.error?.message || 'Something went wrong while rendering this section.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) this.props.onReset();
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type AdminView =
  | 'timetable'
  | 'publish'
  | 'tv-control'
  | 'users'
  | 'reports'
  | 'history'
  | 'alert'
  | 'settings';

export interface StaffUser {
  id: number;
  login_id: string;
  display_name: string;
  role: 'ADMIN' | 'EDITOR';
  disabled: number;
  created_at: string;
  last_login_at: string | null;
}

export interface SnapshotItem {
  version: number;
  publishedAt: string;
  publishedBy: string;
  kind: 'PUBLISH' | 'ROLLBACK';
  note: string | null;
  rolledBackFrom: number | null;
  serviceCount: number;
  isLive: boolean;
}

export interface PublishDiffItem {
  before?: BusService;
  after?: BusService;
  changes?: string[];
}

export interface PublishPreviewData {
  diff: {
    added: BusService[];
    removed: BusService[];
    changed: PublishDiffItem[];
    meta: string[];
    alertChanged?: boolean;
    displayChanged?: boolean;
    stationChanged?: boolean;
    lastVerifiedChanged?: boolean;
  };
  warnings: Array<{ code: string; message_en: string; message_si: string }>;
  validation: {
    ok: boolean;
    errors: Array<{ field: string; code: string; message_en: string; message_si: string; serviceId?: string }>;
  };
  draftRevision: number;
  nextVersion: number;
}

export interface QrStat {
  scan_date: string;
  unique_visitors: number;
  total_scans: number;
}

export interface Suggestion {
  id: string;
  created_at: string;
  category: 'WRONG_TIME' | 'MISSING_BUS' | 'APP_ISSUE' | 'OTHER';
  message: string;
  route_hint: string | null;
  status: 'OPEN' | 'RESOLVED';
}

export interface ServiceFormData {
  id?: string;
  destChoice: string;
  destSi: string;
  destEn: string;
  viaSi: string;
  viaEn: string;
  originChoice: string;
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
  days: (number | Weekday)[];
  bay: string;
  active: boolean;
}

export interface BulkRowItem {
  id: string;
  destEn: string;
  destSi: string;
  departure: string;
  arrival: string;
  originEn: string;
  originSi: string;
  operator: 'PVT' | 'CTB';
  serviceType: 'NORMAL' | 'SEMI_LUXURY' | 'LUXURY' | 'EXPRESS';
  days: Weekday[];
}

function createEmptyBulkRow(): BulkRowItem {
  return {
    id: crypto.randomUUID(),
    destEn: '',
    destSi: '',
    departure: '',
    arrival: '',
    originEn: 'Mahiyanganaya',
    originSi: 'මහියංගනය',
    operator: 'PVT',
    serviceType: 'NORMAL',
    days: [1, 2, 3, 4, 5, 6, 7],
  };
}

function bulkService(row: BulkRowItem): BusService {
  return { id: row.id, destination: { si: row.destSi.trim(), en: row.destEn.trim() }, origin: { si: row.originSi.trim(), en: row.originEn.trim() },
    departure: normalizeTime(row.departure) || row.departure, arrival: row.arrival.trim() ? normalizeTime(row.arrival) || row.arrival : null,
    via: null, tripStart: null, destinationArrival: null, operator: row.operator, serviceType: row.serviceType, days: row.days, bay: null, active: true };
}
function validateBulkRow(row: BulkRowItem, context: Parameters<typeof validateServiceStrict>[1]) {
  if (!row.destEn.trim() && !row.destSi.trim() && !row.departure.trim() && !row.arrival.trim()) return { ok: true, errors: [] as string[], fields: [] as string[] };
  const { errors } = validateServiceStrict(bulkService(row), context);
  return { ok: errors.length === 0, errors: errors.map(error => `${error.field}: ${error.message_en} / ${error.message_si}`), fields: errors.map(error => error.field) };
}
function BulkTimePicker({ value, onChange, optional = false, invalid = false }: { value: string; onChange: (value: string) => void; optional?: boolean; invalid?: boolean }) {
  const parsed = normalizeTime(value);
  const time = to12h(parsed || '00:00');
  const update = (hour: number, minute: number, meridiem: 'AM' | 'PM') => onChange(to24h(hour, minute, meridiem));
  return <div className={`rounded border p-1 ${invalid ? 'border-rose-500' : 'border-slate-700'}`}>
    {optional && <label className="text-xs"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? '00:00' : '')} /> Arrival</label>}
    {(!optional || value) && <div className="flex flex-wrap gap-1">
      <select aria-label="Hour" className="bg-slate-900" value={parsed ? time.hour : ''} onChange={e => update(Number(e.target.value), Number(time.minute), time.meridiem)}><option value="" disabled>Hour</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
      <select aria-label="Minute" className="bg-slate-900" value={Number(time.minute)} onChange={e => update(time.hour, Number(e.target.value), time.meridiem)}>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}</select>
      <select aria-label="AM/PM" className="bg-slate-900" value={time.meridiem} onChange={e => update(time.hour, Number(time.minute), e.target.value as 'AM' | 'PM')}><option>AM</option><option>PM</option></select>
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Helpers & Validation
// ---------------------------------------------------------------------------

export function normalizeDayNum(d: unknown): number {
  if (typeof d === 'number' && d >= 1 && d <= 7) return d;
  const map: Record<string, number> = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };
  return map[String(d).toUpperCase()] ?? 0;
}

export async function safeJson<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') || res.url.includes('/cdn-cgi/access/login')) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('admin:session-expired'));
    throw new Error('Cloudflare Access session expired. Please sign in again.');
  }
  const rawText = await res.text();
  const text = rawText.trim();
  if (text.startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('admin:session-expired'));
    throw new Error('Server returned HTML instead of JSON. Your session may have expired.');
  }
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Invalid JSON response from server.');
  }
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('Accept', 'application/json, text/plain, */*');
  if (typeof window !== 'undefined') headers.set('Origin', window.location.origin);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (
    typeof window !== 'undefined' &&
    ((res.status === 401 && path !== '/api/auth/me') ||
      (res.redirected && (res.url.includes('/cdn-cgi/access') || res.url.includes('/login'))))
  ) {
    window.dispatchEvent(new CustomEvent('admin:session-expired'));
  }
  return res;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
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

function validateSinhalaScript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Required';
  if (/\p{Script=Latin}/u.test(trimmed)) {
    return 'Sinhala name must not contain English/Latin letters. Use Sinhala script only.';
  }
  if (!/[\u0D80-\u0DFF]/.test(trimmed)) {
    return 'Must contain valid Sinhala script.';
  }
  if (/\s{2,}/.test(trimmed)) {
    return 'Remove repeated spaces.';
  }
  return null;
}

function validateLatinScript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Required';
  if (!/^[A-Za-z .'-]+$/.test(trimmed)) {
    return 'English name must contain Latin letters, spaces, hyphens, or periods only.';
  }
  if (/\s{2,}/.test(trimmed)) {
    return 'Remove repeated spaces.';
  }
  return null;
}

function formatDays(days: (number | string)[]): string {
  if (!days || days.length === 0) return 'None';
  const dayNums = days.map(normalizeDayNum).filter((n) => n >= 1 && n <= 7);
  if (dayNums.length === 7) return 'Every day (සෑම දිනකම)';
  const isWeekdays =
    dayNums.length === 5 && [1, 2, 3, 4, 5].every((d) => dayNums.includes(d));
  if (isWeekdays) return 'Mon-Fri (සඳුදා - සිකුරාදා)';
  const isWeekends =
    dayNums.length === 2 && [6, 7].every((d) => dayNums.includes(d));
  if (isWeekends) return 'Weekends (සති අන්ත)';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return dayNums
    .slice()
    .sort((a, b) => a - b)
    .map((d) => names[d - 1])
    .join(', ');
}

// ---------------------------------------------------------------------------
// CSV / TSV Parsing & Time Normalization Helpers
// ---------------------------------------------------------------------------

function parseCsvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\t') && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function App() {
  // Navigation & Drawer
  const [activeView, setActiveView] = useState<AdminView>('timetable');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Authentication & Access Status
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    displayName: string;
    role: 'ADMIN' | 'EDITOR';
  } | null>(null);
  const [accessConfigured, setAccessConfigured] = useState<boolean | null>(null);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Core Schedule Document & Draft State
  const [services, setServices] = useState<BusService[]>([]);
  const [draftRevision, updateDraftRevision] = useState(1);
  const draftRevisionRef = useRef(1);
  const previewRequestRef = useRef(0);
  const setDraftRevision = useCallback((revision: number) => {
    if (Number.isSafeInteger(revision) && revision >= draftRevisionRef.current) {
      draftRevisionRef.current = revision;
      updateDraftRevision(revision);
    }
  }, []);
  const [, setLiveVersion] = useState<number | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<SnapshotItem | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState<boolean>(false);
  const [lastVerifiedDate, setLastVerifiedDate] = useState<string | null>(null);
  const [stationName, setStationName] = useState({ si: 'මහියංගනය බස් නැවතුම්පොළ', en: 'Mahiyanganaya Bus Stand' });
  const [stationMobileUrl, setStationMobileUrl] = useState('https://example.invalid');
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);

  // Alert Banner State
  const [alertBanner, setAlertBanner] = useState<AlertBanner | null>(null);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('INFO');
  const [alertTextSi, setAlertTextSi] = useState('');
  const [alertTextEn, setAlertTextEn] = useState('');
  const [alertHasExpiry, setAlertHasExpiry] = useState(false);
  const [alertExpiryDate, setAlertExpiryDate] = useState(colomboDate());
  const [alertExpiryTime, setAlertExpiryTime] = useState('23:59');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  // Display Settings Form State (ADMIN only)
  const [settingsForm, setSettingsForm] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // MTBA Standalone PWA & APK State
  const [hasMtbaApk, setHasMtbaApk] = useState(false);
  const [adminInstallPrompt, setAdminInstallPrompt] = useState<any>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [showPwaInstructions, setShowPwaInstructions] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [dayFilter, setDayFilter] = useState<string>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<'ALL' | 'CTB' | 'PVT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Add / Edit Bus Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<ServiceFormData>({
    destChoice: '',
    destSi: '',
    destEn: '',
    viaSi: '',
    viaEn: '',
    originChoice: 'මහියංගනය',
    originSi: 'මහියංගනය',
    originEn: 'Mahiyanganaya',
    depHour: 6,
    depMinute: 30,
    depMeridiem: 'AM',
    hasArrival: false,
    arrHour: 10,
    arrMinute: 0,
    arrMeridiem: 'AM',
    operator: 'PVT',
    serviceType: 'NORMAL',
    days: [1, 2, 3, 4, 5, 6, 7],
    bay: '',
    active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formInvalidFields, setFormInvalidFields] = useState<Set<string>>(new Set());
  const [formSaving, setFormSaving] = useState(false);
  const [previewLongName, setPreviewLongName] = useState(false);

  // Delete Bus Modal State
  const [deletingService, setDeletingService] = useState<BusService | null>(null);
  const [deletingSaving, setDeletingSaving] = useState(false);

  // Publish State
  const [publishPreview, setPublishPreview] = useState<PublishPreviewData | null>(null);
  const [publishLoadingPreview, setPublishLoadingPreview] = useState(false);
  const [releaseNote, setReleaseNote] = useState('');
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{ version: number; publishedAt: string } | null>(null);
  const [publishRejectionError, setPublishRejectionError] = useState<{
    message: string;
    errors?: Array<{ field: string; code: string; message_en: string; message_si: string; serviceId?: string }>;
  } | null>(null);
  const [deduplicating, setDeduplicating] = useState(false);

  // TV Presentation Control State
  const [tvHoldState, setTvHoldState] = useState<{ mode: 'auto' | 'credits' | 'frequent' | 'page'; page?: number; updatedAt?: number }>({
    mode: 'auto',
    page: 1,
  });
  const [customTvHoldPage, setCustomTvHoldPage] = useState<number>(1);
  const [tvHoldSaving, setTvHoldSaving] = useState(false);
  const [reloadingTv, setReloadingTv] = useState(false);
  const [frequentConfig, setFrequentConfig] = useState<FrequentServicesConfig>(DEFAULT_FREQUENT_SERVICES_CONFIG);
  const [frequentConfigSaving, setFrequentConfigSaving] = useState(false);

  // Staff & Users State (ADMIN only)
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userFormData, setUserFormData] = useState({
    login_id: '',
    display_name: '',
    role: 'EDITOR' as 'ADMIN' | 'EDITOR',
  });
  const [userFormSaving, setUserFormSaving] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userRoleUpdating, setUserRoleUpdating] = useState<number | null>(null);

  // Reports & Passenger Feedback State
  const [qrStats, setQrStats] = useState<QrStat[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // CSV / Excel Timetable Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<'SELECT' | 'MAPPING' | 'PREVIEW'>('SELECT');
  const [importMode, setImportMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [importRawRows, setImportRawRows] = useState<string[][]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [colMapping, setColMapping] = useState(() => detectColumns([]));
  const [parsedImportRows, setParsedImportRows] = useState<BusService[]>([]);
  const [importDuplicatesCount, setImportDuplicatesCount] = useState<number>(0);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Delete All Buses Modal State
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeleteAllLoading, setIsDeleteAllLoading] = useState(false);
  const [isActivatingAll, setIsActivatingAll] = useState(false);

  // Bulk Add Rows State
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRowItem[]>([]);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [bulkSaveLoading, setBulkSaveLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((current) => (current === msg ? null : current)), 4500);
  }, []);

  // Session Expired Event Listener
  useEffect(() => {
    const handleExpired = () => setSessionExpired(true);
    window.addEventListener('admin:session-expired', handleExpired);
    return () => window.removeEventListener('admin:session-expired', handleExpired);
  }, []);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const loadCurrentUser = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        configured?: boolean;
        authenticated?: boolean;
        user?: { email: string; displayName: string; role: 'ADMIN' | 'EDITOR' };
        diagnostics?: { message?: string; error?: string; step?: string };
      } | null;

      if (data?.configured !== undefined) {
        setAccessConfigured(data.configured);
      }
      if (res.ok && data?.user) {
        setCurrentUser(data.user);
        setAuthStatusError(null);
      } else {
        setCurrentUser(null);
        if (data?.diagnostics?.error) {
          setAuthStatusError(data.diagnostics.error);
        } else if (res.status === 403) {
          setAuthStatusError('Your email is not on the MBT Staff allow-list. Please contact an administrator.');
        } else if (res.status === 401) {
          setAuthStatusError('Please sign in with your staff email PIN to access editing tools.');
        }
      }
    } catch {
      setAccessConfigured(false);
      setCurrentUser(null);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const draftRes = await apiFetch('/api/draft');
      if (draftRes.ok) {
        const data = await safeJson<{
          document: ScheduleDocument;
          draftRevision: number;
          hasUnpublishedChanges: boolean;
          liveVersion: number | null;
        }>(draftRes);
        if (data.draftRevision < draftRevisionRef.current) return;
        setServices((data.document.services || []).map(service => ({ ...service,
          destination: { si: typeof service.destination?.si === 'string' ? service.destination.si : '', en: typeof service.destination?.en === 'string' ? service.destination.en : '' },
          origin: { si: typeof service.origin?.si === 'string' ? service.origin.si : '', en: typeof service.origin?.en === 'string' ? service.origin.en : '' },
          departure: typeof service.departure === 'string' ? service.departure : '', arrival: typeof service.arrival === 'string' ? service.arrival : null,
          days: Array.isArray(service.days) ? service.days : [],
        })));
        setDraftRevision(data.draftRevision || 1);
        setHasUnpublishedChanges(Boolean(data.hasUnpublishedChanges));
        setLiveVersion(data.liveVersion ?? null);
        setLastVerifiedDate(data.document.lastVerified || null);
        if (data.document.station?.name) {
          setStationName(data.document.station.name);
        }
        if (data.document.station?.mobileUrl) {
          setStationMobileUrl(data.document.station.mobileUrl);
        }
        if (data.document.display) {
          setDisplaySettings(data.document.display);
          setSettingsForm(data.document.display);
        } else {
          setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
          setSettingsForm(DEFAULT_DISPLAY_SETTINGS);
        }
        if (data.document.alert) {
          setAlertBanner(data.document.alert);
          setAlertEnabled(data.document.alert.enabled);
          setAlertSeverity(data.document.alert.severity);
          setAlertTextSi(data.document.alert.text.si || '');
          setAlertTextEn(data.document.alert.text.en || '');
          if (data.document.alert.expiresAt) {
            setAlertHasExpiry(true);
            try {
              const d = new Date(data.document.alert.expiresAt);
              setAlertExpiryDate(colomboDate(d));
              const hours = String(d.getHours()).padStart(2, '0');
              const mins = String(d.getMinutes()).padStart(2, '0');
              setAlertExpiryTime(`${hours}:${mins}`);
            } catch {
              setAlertHasExpiry(false);
            }
          } else {
            setAlertHasExpiry(false);
          }
        } else {
          setAlertBanner(null);
          setAlertEnabled(false);
        }
        return;
      }

      // Fallback to public schedule if draft endpoint is guarded (do not throw on 503)
      const pubRes = await fetch('/schedule.json');
      if (pubRes.ok) {
        const doc = (await safeJson<ScheduleDocument>(pubRes).catch(() => null));
        if (doc) {
          setServices(doc.services || []);
          setLastVerifiedDate(doc.lastVerified || null);
          if (doc.station?.name) {
            setStationName(doc.station.name);
          }
          if (doc.station?.mobileUrl) {
            setStationMobileUrl(doc.station.mobileUrl);
          }
          if (doc.display) {
            setDisplaySettings(doc.display);
            setSettingsForm(doc.display);
          }
          if (doc.alert) {
            setAlertBanner(doc.alert);
            setAlertEnabled(doc.alert.enabled);
            setAlertSeverity(doc.alert.severity);
            setAlertTextSi(doc.alert.text.si || '');
            setAlertTextEn(doc.alert.text.en || '');
          }
        }
      } else {
        // Fallback gracefully to default settings if no snapshot exists yet
        setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
        setSettingsForm(DEFAULT_DISPLAY_SETTINGS);
      }
    } catch (err) {
      console.warn('Failed to load schedule document:', err);
      setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
      setSettingsForm(DEFAULT_DISPLAY_SETTINGS);
    }
  }, []);

  const loadPublishPreview = useCallback(async () => {
    const requestId = ++previewRequestRef.current;
    setPublishLoadingPreview(true);
    setPublishSuccess(null);
    setPublishRejectionError(null);
    setPublishPreview(null);
    try {
      const res = await apiFetch('/api/publish/preview', { method: 'POST', body: JSON.stringify({ draftRevision: draftRevisionRef.current }) });
      if (requestId !== previewRequestRef.current) return;
      const data = await safeJson<PublishPreviewData & { error?: { message?: string } }>(res);
      if (!res.ok) throw new Error(data.error?.message || `Preview failed (HTTP ${res.status}). Refresh the preview or sign in again.`);
      if (typeof data.draftRevision === 'number' && data.draftRevision < draftRevisionRef.current) throw new Error('The draft changed while loading the preview. Refresh Diff to review the latest changes.');
      if (typeof data.draftRevision === 'number') setDraftRevision(data.draftRevision);
      setPublishPreview(data as PublishPreviewData);
    } catch (error) {
      if (requestId === previewRequestRef.current) setPublishRejectionError({ message: error instanceof Error ? error.message : 'Unable to load publish preview.' });
    } finally {
      if (requestId === previewRequestRef.current) setPublishLoadingPreview(false);
    }
  }, [setDraftRevision]);

  const loadTvHold = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/tv-hold');
      if (res.ok) {
        const data = (await res.json()) as { tvHold: { mode: 'auto' | 'credits' | 'frequent' | 'page'; page?: number; updatedAt?: number } };
        if (data.tvHold) setTvHoldState(data.tvHold);
      }
    } catch (err) {
      console.warn('Failed to load tv hold state:', err);
    }
  }, []);

  const loadFrequentServices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/frequent-services');
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; config?: FrequentServicesConfig };
        if (data?.config) setFrequentConfig(data.config);
      }
    } catch (err) {
      console.warn('Failed to load frequent services config:', err);
    }
  }, []);

  const loadStaffUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = (await res.json()) as { users: StaffUser[] };
        setStaffUsers(data.users || []);
      }
    } catch (err) {
      console.warn('Failed to load staff users:', err);
    }
  }, []);

  const loadReportsData = useCallback(async () => {
    setReportsError(null);
    try {
      const [qrRes, suggRes] = await Promise.all([
        apiFetch('/api/admin/qr-stats'),
        apiFetch('/api/admin/suggestions'),
      ]);
      if (!qrRes.ok && !suggRes.ok) {
        setReportsError('Failed to load analytics and passenger reports from server.');
        return;
      }
      if (qrRes.ok) {
        const data = (await qrRes.json()) as { stats: QrStat[] };
        setQrStats(data.stats || []);
      } else {
        setReportsError('Failed to load QR scan analytics.');
      }
      if (suggRes.ok) {
        const data = (await suggRes.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.warn('Failed to load reports data:', err);
      setReportsError(err instanceof Error ? err.message : 'Network error loading reports');
    }
  }, []);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await apiFetch('/api/snapshots');
      if (res.ok) {
        const data = await safeJson<{ snapshots: SnapshotItem[] }>(res);
        const live = (data.snapshots || []).find((s) => s.isLive);
        if (live) setLiveSnapshot(live);
      }
    } catch (err) {
      console.warn('Failed to load snapshots:', err);
    }
  }, []);

  // Initial Boot
  useEffect(() => {
    void loadCurrentUser();
    void loadSchedule();
    void loadTvHold();
    void loadFrequentServices();
    void loadSnapshots();
  }, [loadCurrentUser, loadSchedule, loadTvHold, loadFrequentServices, loadSnapshots]);

  // View-Specific Data Fetching
  useEffect(() => {
    if (activeView === 'publish') {
      void (async () => { await loadSchedule(); await loadPublishPreview(); })();
    } else if (activeView === 'users' && currentUser?.role === 'ADMIN') {
      void loadStaffUsers();
    } else if (activeView === 'reports') {
      void loadReportsData();
    } else if (activeView === 'tv-control') {
      void loadTvHold();
      void loadFrequentServices();
    }
  }, [activeView, currentUser, loadSchedule, loadPublishPreview, loadStaffUsers, loadReportsData, loadTvHold, loadFrequentServices]);

  // Global Live Sync: Poll TV presentation hold mode every 5 seconds & on window focus
  useEffect(() => {
    const timer = setInterval(() => {
      void loadTvHold();
    }, 5000);
    const handleFocus = () => {
      void loadTvHold();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadTvHold]);

  // Check for uploaded MTBA standalone APK and capture PWA beforeinstallprompt
  useEffect(() => {
    async function checkMtbaApk() {
      try {
        const res = await fetch('/downloads/mtba-admin.apk', { method: 'HEAD' });
        if (res.ok) {
          setHasMtbaApk(true);
        }
      } catch {
        // Not uploaded yet
      }
    }
    void checkMtbaApk();

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setAdminInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setPwaInstalled(true);
      setAdminInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleAdminPwaInstall = async () => {
    if (adminInstallPrompt) {
      try {
        await adminInstallPrompt.prompt();
        const choice = await adminInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setPwaInstalled(true);
          setAdminInstallPrompt(null);
        } else {
          setShowPwaInstructions(true);
        }
      } catch {
        setShowPwaInstructions(true);
      }
    } else {
      setShowPwaInstructions((prev) => !prev);
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // Quick Action: Active / Inactive Toggle
  async function handleToggleActive(bus: BusService) {
    const updated: BusService = { ...bus, active: !bus.active };
    try {
      const res = await apiFetch(`/api/draft/services/${bus.id}`, {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json() as { draftRevision: number };
        setDraftRevision(data.draftRevision);
        setServices((prev) => prev.map((s) => (s.id === bus.id ? updated : s)));
        void loadPublishPreview();
        setHasUnpublishedChanges(true);
        showToast(`${bus.destination.si} bus is now ${updated.active ? 'ACTIVE (visible on TV)' : 'HIDDEN from TV'}`);
      } else {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } };
        alert(`Could not toggle status: ${err?.error?.message || 'Server rejected changes'}`);
      }
    } catch (err) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Open Add Bus Modal
  function handleOpenCreateModal() {
    setIsEditMode(false);
    setFormData({
      id: crypto.randomUUID(),
      destChoice: '',
      destSi: '',
      destEn: '',
      viaSi: '',
      viaEn: '',
      originChoice: 'මහියංගනය',
      originSi: 'මහියංගනය',
      originEn: 'Mahiyanganaya',
      depHour: 6,
      depMinute: 30,
      depMeridiem: 'AM',
      hasArrival: false,
      arrHour: 10,
      arrMinute: 0,
      arrMeridiem: 'AM',
      operator: 'PVT',
      serviceType: 'NORMAL',
      days: [1, 2, 3, 4, 5, 6, 7],
      bay: '',
      active: true,
    });
    setFormError(null);
    setFormInvalidFields(new Set());
    setPreviewLongName(false);
    setIsModalOpen(true);
  }

  // Open Edit Bus Modal
  function handleOpenEditModal(bus: BusService) {
    setIsEditMode(true);
    const dep = to12h(normalizeTime(bus.departure) || '00:00');
    const arr = bus.arrival ? to12h(bus.arrival) : null;
    const destMatch = KNOWN_PLACES.find(
      (p) => p.si === bus.destination.si && p.en.toLowerCase() === bus.destination.en.toLowerCase()
    );
    const originMatch = KNOWN_PLACES.find(
      (p) => p.si === bus.origin.si && p.en.toLowerCase() === bus.origin.en.toLowerCase()
    );

    let viaSi = '';
    let viaEn = '';
    if (bus.via) {
      if (typeof bus.via === 'string') {
        viaEn = bus.via;
        const match = KNOWN_PLACES.find(
          (p) => p.en.toLowerCase() === (bus.via as string).toLowerCase() || p.si === bus.via
        );
        if (match) {
          viaSi = match.si;
          viaEn = match.en;
        }
      } else {
        viaSi = bus.via.si || '';
        viaEn = bus.via.en || '';
      }
    }

    setFormData({
      id: bus.id,
      destChoice: destMatch ? destMatch.si : '__NEW__',
      destSi: bus.destination.si,
      destEn: bus.destination.en,
      viaSi,
      viaEn,
      originChoice: originMatch ? originMatch.si : '__NEW__',
      originSi: bus.origin.si,
      originEn: bus.origin.en,
      depHour: dep.hour,
      depMinute: Number(dep.minute),
      depMeridiem: dep.meridiem,
      hasArrival: Boolean(bus.arrival),
      arrHour: arr ? arr.hour : 12,
      arrMinute: arr ? Number(arr.minute) : 0,
      arrMeridiem: arr ? arr.meridiem : 'PM',
      operator: bus.operator === 'CTB' ? 'CTB' : 'PVT',
      serviceType: bus.serviceType,
      days: Array.isArray(bus.days) ? bus.days : [1, 2, 3, 4, 5, 6, 7],
      bay: bus.bay || '',
      active: bus.active,
    });
    setFormError(null);
    setFormInvalidFields(new Set());
    setPreviewLongName(false);
    setIsModalOpen(true);
  }

  // Open Duplicate Bus Modal
  function handleOpenDuplicateModal(bus: BusService) {
    setIsEditMode(false);
    const dep = to12h(normalizeTime(bus.departure) || '00:00');
    const arr = bus.arrival ? to12h(bus.arrival) : null;
    const destMatch = KNOWN_PLACES.find(
      (p) => p.si === bus.destination.si && p.en.toLowerCase() === bus.destination.en.toLowerCase()
    );
    const originMatch = KNOWN_PLACES.find(
      (p) => p.si === bus.origin.si && p.en.toLowerCase() === bus.origin.en.toLowerCase()
    );

    let viaSi = '';
    let viaEn = '';
    if (bus.via) {
      if (typeof bus.via === 'string') {
        viaEn = bus.via;
        const match = KNOWN_PLACES.find(
          (p) => p.en.toLowerCase() === (bus.via as string).toLowerCase() || p.si === bus.via
        );
        if (match) {
          viaSi = match.si;
          viaEn = match.en;
        }
      } else {
        viaSi = bus.via.si || '';
        viaEn = bus.via.en || '';
      }
    }

    // Auto-advance by 1 hour for convenient distinct timing
    const nextHour = (dep.hour % 12) + 1;

    setFormData({
      id: crypto.randomUUID(), // Brand new UUID so it never causes ID collision
      destChoice: destMatch ? destMatch.si : '__NEW__',
      destSi: bus.destination.si,
      destEn: bus.destination.en,
      viaSi,
      viaEn,
      originChoice: originMatch ? originMatch.si : '__NEW__',
      originSi: bus.origin.si,
      originEn: bus.origin.en,
      depHour: nextHour,
      depMinute: Number(dep.minute),
      depMeridiem: dep.meridiem,
      hasArrival: Boolean(bus.arrival),
      arrHour: arr ? (arr.hour % 12) + 1 : 12,
      arrMinute: arr ? Number(arr.minute) : 0,
      arrMeridiem: arr ? arr.meridiem : 'PM',
      operator: bus.operator === 'CTB' ? 'CTB' : 'PVT',
      serviceType: bus.serviceType,
      days: Array.isArray(bus.days) ? [...bus.days] : [1, 2, 3, 4, 5, 6, 7],
      bay: bus.bay || '',
      active: true,
    });
    setFormError(null);
    setFormInvalidFields(new Set());
    setPreviewLongName(false);
    setIsModalOpen(true);
  }

  // Save Bus (Add, Edit, Duplicate)
  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormInvalidFields(new Set());
    setFormSaving(true);

    const destSiErr = validateSinhalaScript(formData.destSi);
    if (destSiErr) {
      setFormError(`Destination Sinhala: ${destSiErr}`);
      setFormInvalidFields(new Set(['destination.si']));
      setFormSaving(false);
      return;
    }
    const destEnErr = validateLatinScript(formData.destEn);
    if (destEnErr) {
      setFormError(`Destination English: ${destEnErr}`);
      setFormInvalidFields(new Set(['destination.en']));
      setFormSaving(false);
      return;
    }
    const originSiErr = validateSinhalaScript(formData.originSi);
    if (originSiErr) {
      setFormError(`From (Origin) Sinhala: ${originSiErr}`);
      setFormInvalidFields(new Set(['origin.si']));
      setFormSaving(false);
      return;
    }
    const originEnErr = validateLatinScript(formData.originEn);
    if (originEnErr) {
      setFormError(`From (Origin) English: ${originEnErr}`);
      setFormInvalidFields(new Set(['origin.en']));
      setFormSaving(false);
      return;
    }
    if (formData.viaSi.trim()) {
      const viaSiErr = validateSinhalaScript(formData.viaSi.trim());
      if (viaSiErr) {
        setFormError(`Via Sinhala: ${viaSiErr}`);
        setFormInvalidFields(new Set(['via.si']));
        setFormSaving(false);
        return;
      }
    }
    if (formData.viaEn.trim()) {
      const viaEnErr = validateLatinScript(formData.viaEn.trim());
      if (viaEnErr) {
        setFormError(`Via English: ${viaEnErr}`);
        setFormInvalidFields(new Set(['via.en']));
        setFormSaving(false);
        return;
      }
    }

    if (formData.days.length === 0) {
      setFormError('Please select at least one day of the week. / සතියේ අවම වශයෙන් එක් දිනයක් තෝරන්න.');
      setFormInvalidFields(new Set(['days']));
      setFormSaving(false);
      return;
    }

    try {
      const departure = to24h(formData.depHour, formData.depMinute, formData.depMeridiem);
      const arrival = formData.hasArrival
        ? to24h(formData.arrHour, formData.arrMinute, formData.arrMeridiem)
        : null;

      if (formData.hasArrival && arrival) {
        const gap = (minutes(departure) - minutes(arrival) + 1440) % 1440;
        if (gap > 180) {
          setFormError('Arrival to departure wait time exceeds 180 minutes (3 hours). / පැමිණීම සහ පිටත්වීම අතර කාලය විනාඩි 180 ඉක්මවයි.');
          setFormInvalidFields(new Set(['arrival']));
          setFormSaving(false);
          return;
        }
      }

      const viaSi = formData.viaSi.trim();
      const viaEn = formData.viaEn.trim();
      let via: BusService['via'] = null;
      if (viaSi && viaEn) {
        via = { si: viaSi, en: viaEn };
      } else if (viaSi || viaEn) {
        const text = viaEn || viaSi;
        const known = KNOWN_PLACES.find(
          (p) => p.en.toLowerCase() === text.toLowerCase() || p.si === text
        );
        if (known) {
          via = { si: viaSi || known.si, en: viaEn || known.en };
        } else {
          via = viaEn || viaSi;
        }
      }

      // Construct strict payload with all required nullable fields
      const payload = {
        id: formData.id || crypto.randomUUID(),
        destination: { si: formData.destSi.trim(), en: formData.destEn.trim() },
        origin: { si: formData.originSi.trim(), en: formData.originEn.trim() },
        via,
        departure,
        arrival,
        tripStart: null,
        destinationArrival: null,
        operator: formData.operator,
        serviceType: formData.serviceType,
        days: formData.days,
        bay: formData.bay.trim() || null,
        active: formData.active,
      };

      const url = isEditMode ? `/api/draft/services/${formData.id}` : '/api/draft/services';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        service?: BusService;
        draftRevision?: number;
        error?: { code?: string; message?: string; details?: Array<{ field?: string; code?: string; message_en?: string; message_si?: string }> };
        errors?: Array<{ field?: string; message_en?: string; message_si?: string }>;
      } | null;

      if (!res.ok || !data?.service) {
        // Granular error extraction from details or errors array
        const detailsList = Array.isArray(data?.error?.details)
          ? data?.error?.details
          : Array.isArray(data?.errors)
            ? data?.errors
            : [];

        if (detailsList.length > 0) {
          const invalidSet = new Set<string>();
          const errorLines = detailsList.map((err) => {
            if (err.field) invalidSet.add(err.field);
            const en = err.message_en || 'Validation failed';
            const si = err.message_si ? ` (${err.message_si})` : '';
            return `• ${err.field ? `${err.field}: ` : ''}${en}${si}`;
          });
          setFormInvalidFields(invalidSet);
          setFormError(`Please correct the following fields:\n${errorLines.join('\n')}`);
        } else {
          setFormError(data?.error?.message || 'Server rejected changes. Please check inputs.');
        }
        setFormSaving(false);
        return;
      }

      // Update state
      if (isEditMode) {
        setServices((prev) => prev.map((s) => (s.id === data.service!.id ? data.service! : s)));
        showToast(`Bus to ${data.service.destination.si} (${data.service.destination.en}) updated.`);
      } else {
        setServices((prev) => [...prev, data.service!]);
        showToast(`Bus to ${data.service.destination.si} (${data.service.destination.en}) added.`);
      }
      setHasUnpublishedChanges(true);
      if (data.draftRevision) setDraftRevision(data.draftRevision);
      setHasUnpublishedChanges(true);
      void loadPublishPreview();
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save bus service.');
    } finally {
      setFormSaving(false);
    }
  }

  // Delete Bus Action
  async function handleConfirmDelete() {
    if (!deletingService || deletingSaving) return;
    setDeletingSaving(true);
    try {
      const res = await apiFetch(`/api/draft/services/${deletingService.id}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { draftRevision?: number } | null;
        if (data?.draftRevision) setDraftRevision(data.draftRevision);
        setServices((prev) => prev.filter((s) => s.id !== deletingService.id));
        setHasUnpublishedChanges(true);
        void loadPublishPreview();
        showToast(`Bus to ${deletingService.destination.si} deleted.`);
        setDeletingService(null);
      } else {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } };
        alert(`Delete failed: ${err?.error?.message || 'Server rejected delete'}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingSaving(false);
    }
  }

  // Publish to Live TV Action
  async function handlePublish() {
    if (publishing || !publishConfirmed || publishLoadingPreview || publishPreview?.draftRevision !== draftRevisionRef.current) return;
    setPublishing(true);
    try {
      const rev = draftRevisionRef.current;
      const res = await apiFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          draftRevision: rev,
          confirm: true,
          note: releaseNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await safeJson<{ ok?: boolean; version: number; publishedAt?: string }>(res);
        const publishedAt = data.publishedAt || new Date().toISOString();
        setPublishSuccess({ version: data.version, publishedAt });
        setLiveVersion(data.version);
        setHasUnpublishedChanges(false);
        setReleaseNote('');
        setPublishConfirmed(false);
        setPublishRejectionError(null);
        showToast(`🚀 Version #${data.version} published live to TV display!`);
        void loadSchedule();
        void loadSnapshots();

      } else {
        const err = await safeJson<{
          error?: {
            code?: string;
            message?: string;
            details?: Array<{ field: string; code: string; message_en: string; message_si: string; serviceId?: string }>;
          };
          errors?: Array<{ field?: string; code?: string; message_en?: string; message_si?: string; serviceId?: string }>;
        }>(res).catch(() => null);
        const errorDetails: Array<{
          field: string;
          code: string;
          message_en: string;
          message_si: string;
          serviceId?: string;
        }> = Array.isArray(err?.error?.details)
            ? err.error.details
            : Array.isArray(err?.errors)
              ? err.errors.map((e) => {
                const item: {
                  field: string;
                  code: string;
                  message_en: string;
                  message_si: string;
                  serviceId?: string;
                } = {
                  field: e.field || 'unknown',
                  code: e.code || 'VALIDATION',
                  message_en: e.message_en || 'Validation error',
                  message_si: e.message_si || '',
                };
                if (e.serviceId) item.serviceId = e.serviceId;
                return item;
              })
              : [];
        const msg =
          err?.error?.message ||
          errorDetails.map((e) => e.message_en).join('\n') ||
          `Publish failed (HTTP ${res.status}). Refresh Diff for current row errors, or sign in again if the session expired.`;
        setPublishRejectionError({
          message: msg,
          ...(errorDetails.length > 0 ? { errors: errorDetails } : {}),
        });
        showToast('⚠️ Publish rejected: see exact reasons below');
      }
    } catch (e) {
      const msg = `Network error: ${e instanceof Error ? e.message : String(e)}`;
      setPublishRejectionError({ message: msg });
      showToast('⚠️ Network error during publish');
    } finally {
      setPublishing(false);
    }
  }

  // Jump directly to problem bus row in timetable and open edit modal
  function handleJumpToService(serviceId: string) {
    const target = services.find((s) => s.id === serviceId);
    if (target) {
      setSearchTerm('');
      setDayFilter('ALL');
      setOperatorFilter('ALL');
      setStatusFilter('ALL');
      setActiveView('timetable');
      handleOpenEditModal(target);
      showToast(`Editing bus to ${target.destination.si || target.destination.en} (${target.departure})`);
    } else {
      setActiveView('timetable');
      showToast('Navigating to bus timetable');
    }
  }

  async function handleDeleteInvalidRows() {
    const ids = [...new Set((publishPreview?.validation.errors || []).map(error => error.serviceId).filter((id): id is string => Boolean(id)))];
    if (!ids.length || !window.confirm(`Delete these ${ids.length} invalid draft bus rows? Published buses stay unchanged until you publish.`)) return;
    try {
      const res = await apiFetch('/api/draft/invalid-services', { method: 'DELETE', body: JSON.stringify({ ids, confirm: true, draftRevision: draftRevisionRef.current }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Delete failed (HTTP ${res.status}).`);
      setDraftRevision(data.draftRevision);
      setHasUnpublishedChanges(true);
      await loadSchedule();
      await loadPublishPreview();
    } catch (error) { setPublishRejectionError({ message: error instanceof Error ? error.message : 'Could not delete rows.' }); }
  }

  // Auto-remove exact duplicate bus departures with 1 click
  async function handleAutoDeduplicate() {
    if (deduplicating) return;
    setDeduplicating(true);
    try {
      const res = await apiFetch('/api/draft/deduplicate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          removedCount: number;
          removedServices?: Array<{ id: string; departure: string; destination: { en: string; si: string } }>;
          draftRevision?: number;
        };
        if (data.draftRevision) setDraftRevision(data.draftRevision);
        if (data.removedCount > 0) {
          showToast(`✨ Removed ${data.removedCount} duplicate bus row(s).`);
          setPublishRejectionError(null);
          await loadSchedule();
          await loadPublishPreview();
        } else {
          showToast('No exact duplicate departures found.');
        }
      } else {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } };
        alert(`Failed to remove duplicates: ${err?.error?.message || 'Server rejected request'}`);
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeduplicating(false);
    }
  }

  // TV Hold Action
  async function handleSetTvHold(mode: 'auto' | 'credits' | 'frequent' | 'page', page?: number) {
    if (tvHoldSaving) return;
    setTvHoldSaving(true);
    try {
      const res = await apiFetch('/api/admin/tv-hold', {
        method: 'POST',
        body: JSON.stringify({ mode, page }),
      });
      if (res.ok) {
        setTvHoldState({ mode, ...(page !== undefined ? { page } : {}), updatedAt: Date.now() });
        const label =
          mode === 'auto'
            ? '10s Auto-Scroll resumed'
            : mode === 'credits'
              ? 'TV Display held on Credits / QR slide'
              : mode === 'frequent'
                ? 'TV Display held on Frequent Services slide'
                : `TV Display held on Page ${page}`;
        showToast(`📺 ${label}`);
      } else {
        alert('Failed to update TV hold state.');
      }
    } catch (err) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTvHoldSaving(false);
    }
  }

  // Refresh TV Display Trigger
  async function handleTvReload() {
    if (reloadingTv) return;
    setReloadingTv(true);
    try {
      const res = await apiFetch('/api/admin/tv-reload', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast('📺 TV refresh signal sent — Wall TVs will reload within 60s');
      } else {
        alert('Failed to send TV reload signal.');
      }
    } catch (err) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReloadingTv(false);
    }
  }

  // Frequent Services Slide Handlers
  async function handleSaveFrequentServices(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (frequentConfigSaving) return;
    setFrequentConfigSaving(true);
    try {
      const res = await apiFetch('/api/frequent-services', {
        method: 'POST',
        body: JSON.stringify(frequentConfig),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; config: FrequentServicesConfig };
        if (data.config) setFrequentConfig(data.config);
        showToast('📺 Frequent Services Slide updated on live TV');
      } else {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } };
        alert(`Failed to save: ${err?.error?.message || 'Server error'}`);
      }
    } catch (err) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFrequentConfigSaving(false);
    }
  }

  async function handleResetFrequentServices() {
    if (!confirm('Reset Frequent Bus Services slide back to default text and intervals?')) return;
    setFrequentConfig(DEFAULT_FREQUENT_SERVICES_CONFIG);
    setFrequentConfigSaving(true);
    try {
      const res = await apiFetch('/api/frequent-services', {
        method: 'POST',
        body: JSON.stringify(DEFAULT_FREQUENT_SERVICES_CONFIG),
      });
      if (res.ok) {
        showToast('📺 Frequent Services Slide reset to defaults');
      }
    } catch (err) {
      alert(`Failed to reset: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFrequentConfigSaving(false);
    }
  }

  // Staff User Add Action
  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setUserFormSaving(true);
    setUserFormError(null);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userFormData),
      });
      if (res.ok) {
        showToast(`Staff member ${userFormData.display_name} added successfully.`);
        setUserFormData({ login_id: '', display_name: '', role: 'EDITOR' });
        setIsAddUserModalOpen(false);
        void loadStaffUsers();
      } else {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } };
        setUserFormError(data?.error?.message || 'Failed to add staff member.');
      }
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setUserFormSaving(false);
    }
  }

  // Staff Role Update Action
  async function handleUpdateUserRole(userId: number, displayName: string, newRole: 'ADMIN' | 'EDITOR') {
    setUserRoleUpdating(userId);
    try {
      const res = await apiFetch(`/api/staff/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      const data = await safeJson<{ ok?: boolean; error?: { message?: string } }>(res);
      if (!res.ok) {
        showToast(`⚠️ ${data?.error?.message || 'Failed to update user role'}`);
      } else {
        showToast(`Updated ${displayName}'s role to ${newRole}`);
        void loadStaffUsers();
      }
    } catch (err) {
      showToast(`⚠️ Error: ${err instanceof Error ? err.message : 'Failed to update role'}`);
    } finally {
      setUserRoleUpdating(null);
    }
  }

  // Alert Banner Actions
  async function handleSaveAlert(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAlertSaving(true);
    setAlertError(null);
    setAlertSuccessMsg(null);

    try {
      let payload: AlertBanner | null = null;
      if (alertEnabled) {
        const si = alertTextSi.trim();
        const en = alertTextEn.trim();
        if (!si) {
          setAlertError('Sinhala alert text is required when alert is enabled (max 140 chars).');
          setAlertSaving(false);
          return;
        }
        if (si.length > 140) {
          setAlertError('Sinhala alert text exceeds 140 characters limit.');
          setAlertSaving(false);
          return;
        }
        if (!en) {
          setAlertError('English alert text is required when alert is enabled (max 140 chars).');
          setAlertSaving(false);
          return;
        }
        if (en.length > 140) {
          setAlertError('English alert text exceeds 140 characters limit.');
          setAlertSaving(false);
          return;
        }

        let expiresAt: string | null = null;
        if (alertHasExpiry) {
          if (!alertExpiryDate || !alertExpiryTime) {
            setAlertError('Please select both an expiry date and time.');
            setAlertSaving(false);
            return;
          }
          const isoCandidate = `${alertExpiryDate}T${alertExpiryTime}:00+05:30`;
          const expTime = new Date(isoCandidate).getTime();
          if (isNaN(expTime)) {
            setAlertError('Invalid expiry date or time format.');
            setAlertSaving(false);
            return;
          }
          if (expTime <= Date.now()) {
            setAlertError('Expiry date and time must be in the future.');
            setAlertSaving(false);
            return;
          }
          expiresAt = new Date(isoCandidate).toISOString();
        }

        payload = {
          enabled: true,
          severity: alertSeverity,
          text: { si, en },
          expiresAt,
        };
      } else {
        payload = {
          enabled: false,
          severity: alertSeverity,
          text: { si: alertTextSi.trim(), en: alertTextEn.trim() },
          expiresAt: null,
        };
      }

      const res = await apiFetch('/api/draft/alert', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          error?: { message?: string; issues?: Array<{ message_en?: string; message?: string }> };
        } | null;
        const msg =
          errData?.error?.issues?.[0]?.message_en ||
          errData?.error?.issues?.[0]?.message ||
          errData?.error?.message ||
          `Server returned status ${res.status}`;
        setAlertError(`Failed to save alert: ${msg}`);
        return;
      }

      const data = (await res.json()) as { draftRevision?: number };
      if (data.draftRevision) {
        setDraftRevision(data.draftRevision);
      }
      setAlertBanner(payload);
      setHasUnpublishedChanges(true);
      void loadPublishPreview();
      setAlertSuccessMsg('Saved to draft — click Review & Publish to push this update to the live TV display.');
      showToast(alertEnabled ? '⚠️ Alert banner saved to draft' : 'Alert banner disabled in draft');
    } catch (err) {
      setAlertError(`Network error saving alert: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAlertSaving(false);
    }
  }

  async function handleDisableAlert() {
    setAlertEnabled(false);
    setAlertSaving(true);
    setAlertError(null);
    setAlertSuccessMsg(null);
    try {
      const payload: AlertBanner = {
        enabled: false,
        severity: alertSeverity,
        text: { si: alertTextSi.trim(), en: alertTextEn.trim() },
        expiresAt: null,
      };
      const res = await apiFetch('/api/draft/alert', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { draftRevision?: number };
        if (data.draftRevision) {
          setDraftRevision(data.draftRevision);
        }
        setAlertBanner(payload);
        setHasUnpublishedChanges(true);
        void loadPublishPreview();
        setAlertSuccessMsg('Saved to draft — click Review & Publish to push this update to the live TV display.');
        showToast('Alert banner disabled in draft');
      } else {
        setAlertError('Failed to disable alert.');
      }
    } catch (err) {
      setAlertError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAlertSaving(false);
    }
  }

  // Display Settings Actions (ADMIN only)
  async function handleSaveSettings(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccessMsg(null);

    try {
      const grace = Number(settingsForm.departedGraceMinutes);
      if (isNaN(grace) || grace < 0 || grace > 60) {
        setSettingsError('Departed grace minutes must be between 0 and 60.');
        setSettingsSaving(false);
        return;
      }
      const soon = Number(settingsForm.soonThresholdMinutes);
      if (isNaN(soon) || soon < 5 || soon > 60) {
        setSettingsError('Soon threshold minutes must be between 5 and 60.');
        setSettingsSaving(false);
        return;
      }
      const lookahead = Number(settingsForm.lookaheadHours);
      if (isNaN(lookahead) || lookahead < 1 || lookahead > 24) {
        setSettingsError('Lookahead hours must be between 1 and 24.');
        setSettingsSaving(false);
        return;
      }

      // Lock TV to strict 4 rows per page and 10 dwell seconds with 1.5% safe area
      const displayPayload: DisplaySettings = {
        rowsPerPage: 4,
        dwellSeconds: 10,
        fadeMs: 300,
        departedGraceMinutes: grace,
        soonThresholdMinutes: soon,
        lookaheadHours: lookahead,
        safeAreaPercent: 1.5,
        pollIntervalSeconds: Number(settingsForm.pollIntervalSeconds) || 180,
        reloadAtLocalTime: settingsForm.reloadAtLocalTime || '02:30',
      };

      // Save display settings to draft
      const dispRes = await apiFetch('/api/draft/display', {
        method: 'PUT',
        body: JSON.stringify(displayPayload),
      });

      if (!dispRes.ok) {
        const errData = (await dispRes.json().catch(() => null)) as {
          error?: { message?: string; issues?: Array<{ message?: string }> };
        } | null;
        const msg =
          errData?.error?.issues?.[0]?.message ||
          errData?.error?.message ||
          `Server returned status ${dispRes.status}`;
        setSettingsError(`Failed to save display settings: ${msg}`);
        return;
      }

      const dispData = (await dispRes.json().catch(() => null)) as { draftRevision?: number } | null;
      if (dispData?.draftRevision) {
        setDraftRevision(dispData.draftRevision);
      }

      setDisplaySettings(displayPayload);
      setHasUnpublishedChanges(true);
      void loadPublishPreview();
      setSettingsSuccessMsg('Saved to draft — click Review & Publish to push this update to the live TV display.');
      showToast('Display settings saved to draft');
    } catch (err) {
      setSettingsError(`Network error saving settings: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSettingsSaving(false);
    }
  }

  function handleResetSettings() {
    setSettingsForm({
      ...DEFAULT_DISPLAY_SETTINGS,
      rowsPerPage: 4,
      dwellSeconds: 10,
      safeAreaPercent: 1.5,
      fadeMs: 300,
      departedGraceMinutes: 15,
      soonThresholdMinutes: 15,
      lookaheadHours: 8,
    });
    setSettingsError(null);
    setSettingsSuccessMsg(null);
    showToast('Reset settings to system defaults');
  }

  // ---------------------------------------------------------------------------
  // Delete All Services & Bulk Add Logic
  // ---------------------------------------------------------------------------

  async function handleDeleteAllServices() {
    setIsDeleteAllLoading(true);
    try {
      const res = await apiFetch('/api/draft/services', { method: 'DELETE' });
      const data = await safeJson<{ ok?: boolean; draftRevision?: number; error?: { message?: string } }>(res);
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to delete all services.');
      if (typeof data?.draftRevision === 'number') {
        setDraftRevision(data.draftRevision);
      }
      setServices([]);
      setHasUnpublishedChanges(true);
      setIsDeleteAllModalOpen(false);
      showToast('All draft buses have been deleted. You can now import a clean timetable.');
      void loadPublishPreview();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setIsDeleteAllLoading(false);
    }
  }

  async function handleActivateAllServices() {
    if (isActivatingAll || services.length === 0) return;
    setIsActivatingAll(true);
    try {
      let res = await apiFetch('/api/draft/activate-all', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) {
        const allActive = services.map((s) => ({ ...s, active: true }));
        res = await apiFetch('/api/draft/import', {
          method: 'POST',
          body: JSON.stringify({ services: allActive, mode: 'replace', draftRevision }),
        });
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message || 'Failed to activate all buses.');
      }
      const data = (await res.json().catch(() => null)) as { draftRevision?: number } | null;
      if (typeof data?.draftRevision === 'number') {
        setDraftRevision(data.draftRevision);
      }
      await loadSchedule();
      await loadPublishPreview();
      setHasUnpublishedChanges(true);
      showToast(`⚡ All ${services.length} buses are now ACTIVE and visible on the TV display.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Activation failed.');
    } finally {
      setIsActivatingAll(false);
    }
  }

  const bulkContext = { station: { name: stationName, mobileUrl: stationMobileUrl }, services: [...services.filter(service => normalizeTime(service.departure) && service.destination?.en && service.origin?.en && Array.isArray(service.days)), ...bulkRows.map(bulkService)] };

  function handleAddBulkRow() {
    setBulkRows((prev) => [...prev, createEmptyBulkRow()]);
  }

  function handleRemoveBulkRow(id: string) {
    setBulkRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleUpdateBulkRow<K extends keyof BulkRowItem>(id: string, field: K, value: BulkRowItem[K]) {
    setBulkRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'destEn' && typeof value === 'string') {
          const trimmed = value.trim();
          if (!r.destSi.trim() && trimmed) {
            const match = KNOWN_PLACES.find((p) => p.en.toLowerCase() === trimmed.toLowerCase());
            if (match) updated.destSi = match.si;
          }
        } else if (field === 'destSi' && typeof value === 'string') {
          const trimmed = value.trim();
          if (!r.destEn.trim() && trimmed) {
            const match = KNOWN_PLACES.find((p) => p.si === trimmed);
            if (match) updated.destEn = match.en;
          }
        } else if (field === 'originEn' && typeof value === 'string') {
          const trimmed = value.trim();
          if (!r.originSi.trim() && trimmed) {
            const match = KNOWN_PLACES.find((p) => p.en.toLowerCase() === trimmed.toLowerCase());
            if (match) updated.originSi = match.si;
          }
        } else if (field === 'originSi' && typeof value === 'string') {
          const trimmed = value.trim();
          if (!r.originEn.trim() && trimmed) {
            const match = KNOWN_PLACES.find((p) => p.si === trimmed);
            if (match) updated.originEn = match.en;
          }
        }
        return updated;
      }),
    );
  }

  function handleParsePaste() {
    if (!bulkPasteText.trim()) return;
    const lines = bulkPasteText.trim().split(/\r?\n/);
    const newRows: BulkRowItem[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      let destEn = '';
      let destSi = '';
      let dep = '';
      let arr = '';
      let origEn = 'Mahiyanganaya';
      let origSi = 'මහියංගනය';
      let op: 'PVT' | 'CTB' = 'PVT';
      let type: 'NORMAL' | 'SEMI_LUXURY' | 'LUXURY' | 'EXPRESS' = 'NORMAL';

      // Check if parts[0] is Sinhala and parts[1] is English (like mahiyanganaya_buses_clean.csv)
      if (/[\u0D80-\u0DFF]/.test(parts[0] || '') && /[A-Za-z]/.test(parts[1] || '')) {
        destSi = (parts[0] || '').trim();
        destEn = (parts[1] || '').trim();
        dep = (parts[2] || '').trim();
        arr = (parts[3] || '').trim();
        const rawOrigSi = (parts[4] || '').trim();
        const rawOrigEn = (parts[5] || '').trim();
        if (rawOrigSi) origSi = rawOrigSi;
        if (rawOrigEn) origEn = rawOrigEn;
        op = /CTB|SLTB|ලංගම/i.test(parts[6] || '') ? 'CTB' : 'PVT';
        type = /EXPRESS/i.test(parts[7] || '')
          ? 'EXPRESS'
          : /SEMI/i.test(parts[7] || '')
            ? 'SEMI_LUXURY'
            : /LUX/i.test(parts[7] || '')
              ? 'LUXURY'
              : 'NORMAL';
      } else {
        const p0 = (parts[0] || '').trim();
        const pair = resolveTownPair(p0, '', '');
        destEn = pair.en || p0;
        destSi = pair.si || (KNOWN_PLACES.find((p) => p.en.toLowerCase() === destEn.toLowerCase())?.si ?? '');
        dep = (parts[1] || '').trim();
        arr = (parts[2] || '').trim();
        const origRaw = (parts[3] || 'Mahiyanganaya').trim();
        const origPair = resolveTownPair(origRaw, 'Mahiyanganaya', 'මහියංගනය');
        origEn = origPair.en;
        origSi = origPair.si;
        op = /CTB|SLTB|ලංගම/i.test(parts[4] || '') ? 'CTB' : 'PVT';
        type = /EXPRESS/i.test(parts[5] || '')
          ? 'EXPRESS'
          : /SEMI/i.test(parts[5] || '')
            ? 'SEMI_LUXURY'
            : /LUX/i.test(parts[5] || '')
              ? 'LUXURY'
              : 'NORMAL';
      }

      if (destEn || destSi || dep) {
        newRows.push({
          id: crypto.randomUUID(),
          destEn,
          destSi,
          departure: normalizeTime(dep) || dep,
          arrival: normalizeTime(arr) || arr,
          originEn: origEn || 'Mahiyanganaya',
          originSi: origSi || 'මහියංගනය',
          operator: op,
          serviceType: type,
          days: [1, 2, 3, 4, 5, 6, 7],
        });
      }
    }
    if (newRows.length > 0) {
      setBulkRows((prev) => [
        ...prev.filter((r) => r.destEn.trim() || r.destSi.trim() || r.departure.trim()),
        ...newRows,
      ]);
      setBulkPasteText('');
      setShowPasteBox(false);
      showToast(`Parsed and added ${newRows.length} rows to the table.`);
    } else {
      setBulkError('Could not parse any rows from pasted text. Use tab or comma separators.');
    }
  }

  async function handleSaveBulkRows() {
    setBulkSaveLoading(true);
    setBulkError(null);
    try {
      const nonEmpties = bulkRows.filter(
        (r) => r.destEn.trim() || r.destSi.trim() || r.departure.trim() || r.arrival.trim(),
      );
      if (nonEmpties.length === 0) {
        throw new Error('Please fill in at least one row with Destination and Departure time.');
      }

      // Check validation for each row
      for (let i = 0; i < nonEmpties.length; i++) {
        const r = nonEmpties[i]!;
        const res = validateBulkRow(r, bulkContext);
        if (!res.ok) {
          throw new Error(`Row ${i + 1} (${r.destEn || r.destSi || 'unnamed'}): ${res.errors.join('; ')}`);
        }
      }

      const validServices: BusService[] = nonEmpties.map((r) => {
        const dep = normalizeTime(r.departure)!;
        const arr = r.arrival.trim() ? normalizeTime(r.arrival) : null;
        return {
          id: crypto.randomUUID(),
          destination: { en: r.destEn.trim(), si: r.destSi.trim() },
          origin: { en: r.originEn.trim() || 'Mahiyanganaya', si: r.originSi.trim() || 'මහියංගනය' },
          departure: dep,
          arrival: arr,
          via: null,
          tripStart: null,
          destinationArrival: null,
          operator: r.operator,
          serviceType: r.serviceType,
          days: r.days.length > 0 ? r.days : [1, 2, 3, 4, 5, 6, 7],
          bay: null,
          active: true,
        };
      });

      const res = await apiFetch('/api/draft/import', {
        method: 'POST', body: JSON.stringify({ services: validServices, mode: 'append' }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message || 'Failed to save bulk rows.');
      }

      const data = (await res.json().catch(() => null)) as { draftRevision?: number } | null;
      if (data?.draftRevision) {
        setDraftRevision(data.draftRevision);
      }

      setHasUnpublishedChanges(true);
      setIsBulkAddModalOpen(false);
      showToast(`Added ${validServices.length} buses to the draft timetable.`);
      void loadSchedule();
      void loadPublishPreview();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to save rows.');
    } finally {
      setBulkSaveLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // CSV / Excel / JSON File Importer Logic
  // ---------------------------------------------------------------------------

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportError(null);
    setImportLoading(true);

    try {
      const name = file.name.toLowerCase();

      if (name.endsWith('.json')) {
        setParsedImportRows(parseJsonServices(JSON.parse(await file.text())));
        setImportDuplicatesCount(0);
        setImportHeaders([]);
        setImportStep('PREVIEW');
        return;
      }

      let rows: string[][] = [];

      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        // Parse Excel using locally bundled xlsx package
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('Spreadsheet has no sheets.');
        }
        const sheet = workbook.Sheets[firstSheetName];
        if (!sheet) {
          throw new Error('Could not read the first sheet in spreadsheet.');
        }
        rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
        }) as string[][];
      } else {
        // Native CSV / TSV text parsing
        const text = await file.text();
        rows = parseCsvToRows(text);
      }

      if (rows.length < 2) {
        throw new Error('Spreadsheet must contain a header row and at least one data row.');
      }

      const headers = rows[0]!.map((h) => String(h || '').trim());
      setImportHeaders(headers);
      setImportRawRows(rows.slice(1));

      setColMapping(detectColumns(headers));
      setImportStep('MAPPING');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to read file.');
    } finally {
      setImportLoading(false);
    }
  }

  function handleProcessImportRows() {
    try {
      setImportError(null);
      setParsedImportRows(parseSpreadsheet(importRawRows, colMapping));
      setImportDuplicatesCount(0);
      setImportStep('PREVIEW');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not parse timetable.');
    }
  }

  async function handleConfirmImport() {
    if (!parsedImportRows || parsedImportRows.length === 0) {
      setImportError('No valid bus records to import.');
      return;
    }
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await apiFetch('/api/draft/import', {
        method: 'POST',
        body: JSON.stringify({ services: parsedImportRows, mode: importMode === 'REPLACE' ? 'replace' : 'append', draftRevision }),
      });
      const data = await safeJson<{ draftRevision?: number; error?: { message?: string; details?: Array<{ message_en?: string }> } }>(res);
      if (!res.ok) throw new Error(data.error?.details?.map((e: { message_en?: string }) => e.message_en).join('\n') || data.error?.message || `Import failed (HTTP ${res.status}).`);
      if (typeof data.draftRevision === 'number') setDraftRevision(data.draftRevision);
      await loadSchedule();
      await loadPublishPreview();
      setHasUnpublishedChanges(true);
      showToast(`Imported ${parsedImportRows.length} buses successfully (${importDuplicatesCount} duplicates skipped).`);
      setIsImportModalOpen(false);
      setImportStep('SELECT');
      setImportFile(null);
      void loadSchedule();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered Services Computation
  // ---------------------------------------------------------------------------

  const filteredServices = useMemo(() => {
    return services
      .filter((s) => {
        // Search Term
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchDest = s.destination.en.toLowerCase().includes(q) || s.destination.si.includes(q);
          const matchOrigin = s.origin.en.toLowerCase().includes(q) || s.origin.si.includes(q);
          const matchVia = s.via && (
            typeof s.via === 'string'
              ? s.via.toLowerCase().includes(q)
              : (s.via.en && s.via.en.toLowerCase().includes(q)) || (s.via.si && s.via.si.includes(q))
          );
          const matchTime = s.departure.includes(q) || (s.arrival && s.arrival.includes(q));
          const matchOp = s.operator.toLowerCase().includes(q);
          if (!matchDest && !matchOrigin && !matchVia && !matchTime && !matchOp) return false;
        }
        // Day Filter
        if (dayFilter !== 'ALL') {
          if (dayFilter === 'WEEKDAYS') {
            const hasWeekday = s.days.some((d) => {
              const n = normalizeDayNum(d);
              return n >= 1 && n <= 5;
            });
            if (!hasWeekday) return false;
          } else if (dayFilter === 'WEEKENDS') {
            const hasWeekend = s.days.some((d) => {
              const n = normalizeDayNum(d);
              return n === 6 || n === 7;
            });
            if (!hasWeekend) return false;
          } else {
            const dayNum = Number(dayFilter);
            if (!s.days.some((d) => normalizeDayNum(d) === dayNum)) return false;
          }
        }
        // Operator Filter
        if (operatorFilter !== 'ALL' && s.operator !== operatorFilter) return false;
        // Status Filter
        if (statusFilter === 'ACTIVE' && !s.active) return false;
        if (statusFilter === 'INACTIVE' && s.active) return false;
        return true;
      })
      .sort((a, b) => a.departure.localeCompare(b.departure));
  }, [services, searchTerm, dayFilter, operatorFilter, statusFilter]);

  // Dynamic count of unpublished changes
  const unpublishedChangeCount = useMemo(() => {
    if (!publishPreview?.diff) return hasUnpublishedChanges ? 1 : 0;
    const diff = publishPreview.diff;
    const serviceChanges =
      (diff.added?.length || 0) +
      (diff.removed?.length || 0) +
      (diff.changed?.length || 0);
    const metaChanges =
      (diff.alertChanged ? 1 : 0) +
      (diff.displayChanged ? 1 : 0) +
      (diff.stationChanged ? 1 : 0) +
      (diff.lastVerifiedChanged ? 1 : 0);
    const total = serviceChanges + metaChanges;
    return total > 0 ? total : hasUnpublishedChanges ? 1 : 0;
  }, [publishPreview, hasUnpublishedChanges]);

  // Unique list of towns for Add/Edit dropdown
  const knownPlaceOptions = useMemo(() => {
    const set = new Map<string, { en: string; si: string }>();
    KNOWN_PLACES.forEach((p) => set.set(p.en.toLowerCase(), { en: p.en, si: p.si }));
    services.forEach((s) => {
      if (s.destination?.en) set.set(s.destination.en.toLowerCase(), { en: s.destination.en, si: s.destination.si });
      if (s.origin?.en) set.set(s.origin.en.toLowerCase(), { en: s.origin.en, si: s.origin.si });
    });
    return Array.from(set.values()).sort((a, b) => a.en.localeCompare(b.en));
  }, [services]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const todayStr = colomboDate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. STICKY SESSION EXPIRED BANNER */}
      {sessionExpired && (
        <div className="sticky top-0 z-50 p-3.5 bg-rose-600 text-white font-bold text-sm shadow-xl flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <span>Session expired, please sign in again to continue editing.</span>
          </div>
          <a
            href="/cdn-cgi/access/login"
            className="px-4 py-1.5 rounded-lg bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs shadow transition active:scale-95 whitespace-nowrap"
          >
            Sign In / Reload
          </a>
        </div>
      )}

      {/* 2. TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-up text-xs font-medium">
          <span className="text-base">🔔</span>
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. CLEAN TOP HEADER (Hamburger + Title on Left, User + Logout on Right) */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 py-3 shadow-sm">
        <div className="w-full px-4 lg:px-8 flex items-center justify-between gap-3">
          {/* Left: Hamburger & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open Navigation Menu"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 flex items-center justify-center text-lg w-10 h-10"
            >
              ☰
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl">🚌</span>
              <h1 className="text-base font-bold text-white tracking-tight">
                Mahiyanganaya Bus Admin
              </h1>
            </div>
          </div>

          {/* Right: User Name + Role Badge + Log Out */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-200 hidden sm:inline">
                  {currentUser.displayName || currentUser.email}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentUser.role === 'ADMIN'
                      ? 'bg-purple-950/80 text-purple-300 border-purple-800/60'
                      : 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                    }`}
                >
                  {currentUser.role}
                </span>
                <a
                  href="/cdn-cgi/access/logout"
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-medium border border-rose-800/50 transition ml-1"
                >
                  Log Out
                </a>
              </div>
            ) : (
              <a
                href="/cdn-cgi/access/login"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition"
              >
                Sign In
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 4. PERSISTENT STATUS BAR */}
      <section className="bg-slate-900 border-b border-slate-800/80 py-2 text-xs">
        <div className="w-full px-4 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          {/* Live Version Line */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-medium">
                {liveSnapshot ? (
                  <>
                    Live Version <strong className="text-white">v{liveSnapshot.version}</strong>, published by{' '}
                    <span className="text-slate-200">{liveSnapshot.publishedBy}</span> at{' '}
                    <span className="text-slate-400">{formatDate(liveSnapshot.publishedAt)}</span>
                  </>
                ) : (
                  'No published version yet'
                )}
              </span>
            </div>

            {/* Link to view live TV */}
            <a
              href="/tv/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>📺 Open Live TV</span>
              <span>↗</span>
            </a>
          </div>

          {/* Quick Refresh TV Display trigger */}
          <button
            type="button"
            onClick={handleTvReload}
            disabled={reloadingTv}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
          >
            <span>📺</span>
            <span>{reloadingTv ? 'Sending signal...' : 'Refresh TV Display'}</span>
          </button>
        </div>
      </section>

      {/* 5. UNPUBLISHED CHANGES WARNING BANNER */}
      {hasUnpublishedChanges && (
        <div className="bg-amber-950/80 border-b border-amber-600/60 py-2 text-xs">
          <div className="w-full px-4 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-amber-200 font-medium">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                <strong>Unpublished draft changes detected:</strong> Updates have been made to the schedule but are not yet visible on the wall TV.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('publish')}
              className="px-3.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition active:scale-95 whitespace-nowrap"
            >
              Review & Publish to TV →
            </button>
          </div>
        </div>
      )}

      {/* 6. CLOUDFLARE ACCESS ACTIVE (READ-ONLY PREVIEW) NOTICE */}
      {accessConfigured === true && !currentUser && (
        <div className="w-full px-4 lg:px-8 pt-4">
          <div className="p-3.5 rounded-2xl bg-sky-950/50 border border-sky-800/60 text-sky-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <div>
                <strong>Cloudflare Access Active:</strong> You are currently viewing in read-only preview mode.
                {authStatusError ? (
                  <span className="block mt-0.5 text-amber-300 font-medium">{authStatusError}</span>
                ) : (
                  <span className="block mt-0.5 text-slate-300">
                    Sign in with your staff email PIN to create or edit schedules and control the TV display.
                  </span>
                )}
              </div>
            </div>
            <a
              href="/cdn-cgi/access/login"
              className="px-3 py-1.5 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-500/40 text-xs font-semibold whitespace-nowrap transition"
            >
              Sign In / Reload
            </a>
          </div>
        </div>
      )}

      {/* 7. NAVIGATION DRAWER (Slide out from Left) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Sidebar */}
          <aside className="relative w-72 max-w-[80vw] bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between shadow-2xl z-10">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🚌</span>
                  <div>
                    <h2 className="text-sm font-bold text-white">Mahiyanganaya Admin</h2>
                    <span className="text-[10px] text-slate-400">Timetable Management</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Navigation Links (7 Clean Pages) */}
              <nav className="space-y-1.5 text-xs">
                {/* 1. Bus Timetable (Home) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('timetable');
                    setDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'timetable'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🚌</span>
                    <span>Bus List (Home)</span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {services.length}
                  </span>
                </button>

                {/* 2. Publish to TV */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('publish');
                    setDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'publish'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🚀</span>
                    <span>Publish to TV</span>
                  </span>
                  {unpublishedChangeCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold">
                      {unpublishedChangeCount}
                    </span>
                  )}
                </button>

                {/* 3. Alert Banner */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('alert');
                    setDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'alert'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>⚠️</span>
                    <span>Alert Banner</span>
                  </span>
                  {alertBanner?.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                      ACTIVE
                    </span>
                  )}
                </button>

                {/* 4. TV Presentation Control */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('tv-control');
                    setDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'tv-control'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>📺</span>
                    <span>TV Presentation Control</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {tvHoldState.mode}
                  </span>
                </button>

                {/* 5. Staff & Users (ADMIN only) */}
                {currentUser?.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('users');
                      setDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'users'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span>👥</span>
                      <span>Staff & Users</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                      ADMIN
                    </span>
                  </button>
                )}

                {/* 6. Display Settings (ADMIN only) */}
                {currentUser?.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('settings');
                      setDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center justify-between transition ${activeView === 'settings'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span>⚙️</span>
                      <span>Display Settings</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                      ADMIN
                    </span>
                  </button>
                )}

                {/* 7. Reports & Passenger Feedback */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('reports');
                    setDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium flex items-center gap-2.5 transition ${activeView === 'reports'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span>📊</span>
                  <span>Reports & Passenger Feedback</span>
                </button>
              </nav>
            </div>

            <div className="border-t border-slate-800 pt-4 space-y-3">
              {/* MTBA Admin App Card */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-600/40 space-y-2">
                <div className="flex items-center justify-between text-white font-bold text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🛡️</span>
                    <span>MTBA Admin App</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                    Standalone
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Independent administrative portal for timetable management, staff roles, and TV controls.
                </p>

                {hasMtbaApk ? (
                  <a
                    href="/downloads/mtba-admin.apk"
                    download="mtba-admin.apk"
                    className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow transition active:scale-95"
                  >
                    <span>⬇️</span>
                    <span>Download MTBA Admin APK</span>
                  </a>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleAdminPwaInstall}
                      className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition active:scale-95"
                    >
                      <span>⚡</span>
                      <span>{pwaInstalled ? 'MTBA App Installed ✓' : 'Install MTBA App (PWA)'}</span>
                    </button>
                    {showPwaInstructions && (
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-amber-200/90 leading-tight">
                        📱 බ්‍රවුසරයේ තිත් තුන (⋮) හෝ Share ඔබා <strong>&quot;Add to Home screen&quot;</strong> හෝ <strong>&quot;Install app&quot;</strong> තෝරන්න. (PWABuilder හරහා APK සාදා <code>/downloads/mtba-admin.apk</code> වෙත එක් කළ හැක.)
                      </div>
                    )}
                  </div>
                )}
                <div className="text-[10px] text-slate-500 text-center">
                  PWABuilder Ready · Scoped to /admin/
                </div>
              </div>

              <a
                href="/tv/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-between transition"
              >
                <span>Open Live TV</span>
                <span>↗</span>
              </a>
              <div className="text-[10px] text-slate-500 text-center">
                Mahiyanganaya Bus Stand · v1.0
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 8. MAIN CONTENT CONTAINER (Full-Width 16:9 + Responsive) */}
      <main className="w-full px-4 lg:px-8 py-6 flex-1">
        {/* ===================================================================
            SCREEN 1: BUS TIMETABLE (HOME)
           =================================================================== */}
        {activeView === 'timetable' && (
          <section className="space-y-6 w-full animate-fade-in">
            {/* Action Bar (Search, Filters, Import CSV, + Add Bus) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                {/* Search Box */}
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-sm">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by destination (Colombo/කොළඹ), origin, time, or operator..."
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {services.some((s) => !s.active) && (
                    <button
                      type="button"
                      onClick={handleActivateAllServices}
                      disabled={isActivatingAll}
                      className="px-3.5 py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow whitespace-nowrap disabled:opacity-50"
                      title="Make all draft buses active and visible on TV"
                    >
                      <span>⚡</span>
                      <span>{isActivatingAll ? 'Activating All...' : 'Activate All Buses'}</span>
                    </button>
                  )}
                  {services.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteAllModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/80 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow whitespace-nowrap"
                      title="Clear all draft buses"
                    >
                      <span>🗑️</span>
                      <span>Delete All Buses</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportModalOpen(true);
                      setImportStep('SELECT');
                      setImportFile(null);
                      setImportError(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow whitespace-nowrap"
                  >
                    <span>📥</span>
                    <span>Import CSV / Excel / JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkRows([createEmptyBulkRow(), createEmptyBulkRow(), createEmptyBulkRow()]);
                      setBulkError(null);
                      setShowPasteBox(false);
                      setBulkPasteText('');
                      setIsBulkAddModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-lg shadow-indigo-600/30 whitespace-nowrap"
                  >
                    <span>📋</span>
                    <span>Bulk Add Rows</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCreateModal}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-lg shadow-blue-600/30 whitespace-nowrap"
                  >
                    <span>+</span>
                    <span>Add New Bus</span>
                  </button>
                </div>
              </div>

              {/* Filter Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
                {/* Day Filter Chips */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-slate-400 mr-1 text-[11px] font-semibold">Day:</span>
                  {[
                    { id: 'ALL', label: 'All Days' },
                    { id: 'WEEKDAYS', label: 'Weekdays' },
                    { id: 'WEEKENDS', label: 'Weekends' },
                    { id: '1', label: 'Mon' },
                    { id: '2', label: 'Tue' },
                    { id: '3', label: 'Wed' },
                    { id: '4', label: 'Thu' },
                    { id: '5', label: 'Fri' },
                    { id: '6', label: 'Sat' },
                    { id: '7', label: 'Sun' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDayFilter(d.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${dayFilter === d.id
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Operator & Status Selectors */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">Operator:</span>
                    <select
                      value={operatorFilter}
                      onChange={(e) => setOperatorFilter(e.target.value as 'ALL' | 'CTB' | 'PVT')}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="ALL">All Operators</option>
                      <option value="CTB">SLTB / CTB (ලංගම)</option>
                      <option value="PVT">Private (පුද්ගලික)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="ALL">All ({services.length})</option>
                      <option value="ACTIVE">Active ({services.filter((s) => s.active).length})</option>
                      <option value="INACTIVE">Hidden ({services.filter((s) => !s.active).length})</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Full-Width Bus Schedule Table */}
            <div className="hidden md:block rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">ගමනාන්තය · Destination</th>
                      <th className="py-3 px-3">පිටත්වීම · Departure</th>
                      <th className="py-3 px-3">පැමිණීම · Arrival</th>
                      <th className="py-3 px-3">ආරම්භය · From</th>
                      <th className="py-3 px-3">සේවාව · Operator</th>
                      <th className="py-3 px-3">දින · Days</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No matching bus schedules found.
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((bus) => (
                        <tr
                          key={bus.id}
                          className={`hover:bg-slate-800/40 transition ${!bus.active ? 'opacity-40 bg-slate-950/30' : ''}`}
                        >
                          {/* Destination */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-sm text-white">{bus.destination.si}</div>
                            <div className="text-[11px] text-slate-400">{bus.destination.en}</div>
                            {bus.via && (
                              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-medium text-amber-300 border border-amber-500/20">
                                <span>හරහා · Via:</span>
                                <span>{typeof bus.via === 'string' ? bus.via : (bus.via.en || bus.via.si)}</span>
                              </div>
                            )}
                          </td>

                          {/* Departure Time */}
                          <td className="py-3.5 px-3">
                            <div className="font-extrabold text-white text-sm">
                              {formatTime12(bus.departure, 'EN')}
                            </div>
                            <div className="text-[10px] text-slate-500">{bus.departure} (24h)</div>
                          </td>

                          {/* Arrival Time */}
                          <td className="py-3.5 px-3 text-slate-400">
                            {bus.arrival ? formatTime12(bus.arrival, 'EN') : '—'}
                          </td>

                          {/* Origin (From) */}
                          <td className="py-3.5 px-3 text-slate-300">
                            <div className="font-medium">{bus.origin.si}</div>
                            <div className="text-[10px] text-slate-500">{bus.origin.en}</div>
                          </td>

                          {/* Operator */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${bus.operator === 'CTB'
                                  ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                                  : 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                                }`}
                            >
                              {bus.operator}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">{bus.serviceType}</div>
                          </td>

                          {/* Days */}
                          <td className="py-3.5 px-3 text-[11px] text-slate-300">
                            {formatDays(bus.days)}
                          </td>

                          {/* Status Toggle */}
                          <td className="py-3.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(bus)}
                              title={bus.active ? 'Click to Hide from TV display' : 'Click to Show on TV display'}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition active:scale-95 ${bus.active
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                                }`}
                            >
                              {bus.active ? '● Active' : '○ Hidden'}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(bus)}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDuplicateModal(bus)}
                                title="Duplicate bus with a new ID"
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingService(bus)}
                                className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs border border-rose-900/50 transition"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Touch Cards View (screen < 768px) */}
            <div className="md:hidden space-y-3">
              {filteredServices.length === 0 ? (
                <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  No matching bus schedules found.
                </div>
              ) : (
                filteredServices.map((bus) => (
                  <div
                    key={bus.id}
                    className={`p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-3 transition ${!bus.active ? 'opacity-50' : ''
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-white">{bus.destination.si}</div>
                        <div className="text-xs text-slate-400">
                          {bus.destination.en} · From: {bus.origin.si}
                        </div>
                        {bus.via && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-medium text-amber-300 border border-amber-500/20">
                            <span>හරහා · Via:</span>
                            <span>{typeof bus.via === 'string' ? bus.via : (bus.via.en || bus.via.si)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-white">{formatTime12(bus.departure, 'EN')}</div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${bus.operator === 'CTB'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}
                        >
                          {bus.operator}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Days: <span className="text-slate-200">{formatDays(bus.days)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(bus)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold ${bus.active
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                      >
                        {bus.active ? 'Active' : 'Hidden'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDuplicateModal(bus)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs border border-slate-700"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(bus)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingService(bus)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-950 text-rose-300 text-xs border border-rose-900"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 2: PUBLISH TO TV (WRAPPED IN ERROR BOUNDARY)
           =================================================================== */}
        {activeView === 'publish' && (
          <ErrorBoundary fallbackTitle="Could not load the Publish screen">
            <section className="space-y-6 w-full animate-fade-in">
              {/* Header */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>🚀 Publish Timetable to TV</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                      Next Version: {publishPreview ? `v${publishPreview.nextVersion}` : 'Awaiting preview'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Review differences and push draft schedule changes to the live wall TV display
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadPublishPreview}
                  disabled={publishLoadingPreview}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                >
                  {publishLoadingPreview ? 'Refreshing...' : '🔄 Refresh Diff'}
                </button>
              </div>

              {/* Success Confirmation Card */}
              {publishSuccess && (
                <div className="p-6 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 shadow-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🎉</span>
                    <div>
                      <h3 className="text-lg font-bold text-emerald-100">
                        Version #{publishSuccess.version} Published Live Successfully!
                      </h3>
                      <p className="text-xs text-emerald-300">
                        Published at {formatDate(publishSuccess.publishedAt)}. Wall TVs and offline caches will auto-reload.
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center gap-3">
                    <a
                      href="/tv/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition flex items-center gap-2"
                    >
                      <span>📺 Open Live TV Display (/tv/)</span>
                      <span>↗</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveView('timetable')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
                    >
                      Back to Bus List
                    </button>
                  </div>
                </div>
              )}

              {/* Diff Summary Card */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-base font-bold text-white flex items-center justify-between">
                  <span>Schedule Difference Summary</span>
                  {publishPreview?.diff && (
                    <span className="text-xs font-normal text-slate-400">
                      {publishPreview.diff.added?.length || 0} added · {publishPreview.diff.removed?.length || 0} removed ·{' '}
                      {publishPreview.diff.changed?.length || 0} changed
                      {(publishPreview.diff.alertChanged || publishPreview.diff.displayChanged || publishPreview.diff.stationChanged || publishPreview.diff.lastVerifiedChanged) && (
                        <span className="text-blue-300 font-medium"> · settings updated</span>
                      )}
                    </span>
                  )}
                </h3>

                {publishLoadingPreview ? (
                  <div className="py-8 text-center text-slate-400">Comparing draft with live schedule...</div>
                ) : !publishPreview?.diff || (
                  (publishPreview.diff.added?.length || 0) === 0 &&
                  (publishPreview.diff.removed?.length || 0) === 0 &&
                  (publishPreview.diff.changed?.length || 0) === 0 &&
                  !publishPreview.diff.alertChanged &&
                  !publishPreview.diff.displayChanged &&
                  !publishPreview.diff.stationChanged &&
                  !publishPreview.diff.lastVerifiedChanged &&
                  !hasUnpublishedChanges
                ) ? (
                  <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    ✨ No unpublished changes. The draft schedule matches the live TV display.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Added Buses */}
                    {(publishPreview.diff.added?.length || 0) > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <span>+ Added Buses ({publishPreview.diff.added.length})</span>
                        </div>
                        <div className="divide-y divide-slate-800 border border-emerald-900/50 rounded-xl bg-emerald-950/20 overflow-hidden text-xs">
                          {publishPreview.diff.added.map((bus) => (
                            <div key={bus.id} className="p-3 flex items-center justify-between gap-3">
                              <div>
                                <strong className="text-emerald-200">{bus?.destination?.si ?? 'Unknown'}</strong>{' '}
                                <span className="text-slate-400">({bus?.destination?.en ?? 'Unknown'})</span>
                                <div className="text-[11px] text-slate-400">From: {bus?.origin?.si ?? 'Mahiyanganaya'}</div>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-white">{bus?.departure ? formatTime12(bus.departure, 'EN') : '--:--'}</span>
                                <div className="text-[10px] text-slate-400">{bus?.operator ?? 'PVT'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Removed Buses */}
                    {(publishPreview.diff.removed?.length || 0) > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <span>- Removed Buses ({publishPreview.diff.removed.length})</span>
                        </div>
                        <div className="divide-y divide-slate-800 border border-rose-900/50 rounded-xl bg-rose-950/20 overflow-hidden text-xs">
                          {publishPreview.diff.removed.map((bus) => (
                            <div key={bus.id} className="p-3 flex items-center justify-between gap-3">
                              <div>
                                <strong className="text-rose-200">{bus?.destination?.si ?? 'Unknown'}</strong>{' '}
                                <span className="text-slate-400">({bus?.destination?.en ?? 'Unknown'})</span>
                                <div className="text-[11px] text-slate-400">From: {bus?.origin?.si ?? 'Mahiyanganaya'}</div>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-white line-through text-slate-400">
                                  {bus?.departure ? formatTime12(bus.departure, 'EN') : '--:--'}
                                </span>
                                <div className="text-[10px] text-slate-400">{bus?.operator ?? 'PVT'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Changed Buses */}
                    {(publishPreview.diff.changed?.length || 0) > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <span>~ Changed Buses ({publishPreview.diff.changed.length})</span>
                        </div>
                        <div className="divide-y divide-slate-800 border border-amber-900/50 rounded-xl bg-amber-950/20 overflow-hidden text-xs">
                          {publishPreview.diff.changed.map((item, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between gap-3">
                              <div>
                                <strong className="text-amber-200">
                                  {item.after?.destination?.si || item.before?.destination?.si || 'Service'}
                                </strong>{' '}
                                <span className="text-slate-400">
                                  ({item.after?.destination?.en || item.before?.destination?.en || ''})
                                </span>
                                {item.changes && item.changes.length > 0 && (
                                  <div className="text-[11px] text-amber-300/90 mt-0.5">
                                    {item.changes.join('; ')}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400 line-through mr-1">
                                  {item.before?.departure}
                                </span>
                                <span className="font-bold text-white">{item.after?.departure}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alert Banner Meta Change */}
                    {publishPreview.diff.alertChanged && (
                      <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🔔</span>
                          <div>
                            <strong className="text-blue-200">Alert Banner Updated:</strong>
                            <span className="text-slate-300 ml-1.5">
                              {alertBanner?.enabled
                                ? `Active (${alertBanner.severity}) · "${alertTextEn || alertTextSi}"`
                                : 'Disabled / Cleared'}
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-blue-950 border border-blue-700 text-[10px] font-bold text-blue-300 uppercase tracking-wider">
                          Alert Meta
                        </span>
                      </div>
                    )}

                    {/* Display Settings Meta Change */}
                    {publishPreview.diff.displayChanged && (
                      <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">⚙️</span>
                          <div>
                            <strong className="text-indigo-200">Display Settings Updated:</strong>
                            <span className="text-slate-300 ml-1.5">
                              Departed Grace: {displaySettings?.departedGraceMinutes ?? 15}m · Soon Highlight: {displaySettings?.soonThresholdMinutes ?? 15}m · Schedule Lookahead: {displaySettings?.lookaheadHours ?? 8}h
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-950 border border-indigo-700 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                          Display Meta
                        </span>
                      </div>
                    )}

                    {/* Station Branding Meta Change */}
                    {publishPreview.diff.stationChanged && (
                      <div className="p-3.5 rounded-xl bg-teal-950/40 border border-teal-800/60 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🏢</span>
                          <div>
                            <strong className="text-teal-200">Station Branding Updated:</strong>
                            <span className="text-slate-300 ml-1.5">
                              {stationName.si} ({stationName.en})
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-teal-950 border border-teal-700 text-[10px] font-bold text-teal-300 uppercase tracking-wider">
                          Station Meta
                        </span>
                      </div>
                    )}

                    {/* Last Verified Date Meta Change */}
                    {publishPreview.diff.lastVerifiedChanged && (
                      <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">📅</span>
                          <div>
                            <strong className="text-purple-200">Timetable Verification Date Updated:</strong>
                            <span className="text-slate-300 ml-1.5">{lastVerifiedDate}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-purple-950 border border-purple-700 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                          Date Meta
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Blocking Validation Errors & Rejection Reasons Card (Red / Rose) */}
              {(() => {
                const allValidationErrors = [
                  ...(publishRejectionError?.errors || []),
                  ...(publishPreview?.validation && !publishPreview.validation.ok ? publishPreview.validation.errors : []),
                ];
                const uniqueBlockingErrors = Array.from(
                  new Map(allValidationErrors.map((e) => [`${e.serviceId ?? 'doc'}-${e.code}-${e.field}`, e])).values(),
                );
                const hasBlocking = uniqueBlockingErrors.length > 0 || Boolean(publishRejectionError);
                if (!hasBlocking) return null;

                const hasDuplicateErrors = uniqueBlockingErrors.some((e) => e.code === 'DUPLICATE_SERVICE');

                return (
                  <div className="p-6 rounded-2xl bg-slate-900 border-2 border-rose-500 shadow-2xl shadow-rose-950/40 space-y-4 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-900/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">⛔</span>
                        <div>
                          <h3 className="text-base font-bold text-rose-100 flex items-center gap-2">
                            <span>Blocking Rejection Reasons</span>
                            <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-700 text-xs font-bold text-rose-300">
                              {uniqueBlockingErrors.length || 1} error{(uniqueBlockingErrors.length || 1) > 1 ? 's' : ''}
                            </span>
                          </h3>
                          <p className="text-xs text-rose-300/90 leading-relaxed">
                            These issues must be resolved before publishing. Wrong times or duplicate departures cause confusion for commuters on the live TV.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Server rejection message banner */}
                    {publishRejectionError?.message && (
                      <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700/80 text-xs text-rose-200 flex items-start gap-2.5">
                        <span className="text-base shrink-0">⚠️</span>
                        <div className="space-y-1">
                          <strong className="text-white block">Server Rejection Response:</strong>
                          <div className="font-mono text-[11px] leading-relaxed text-rose-200">
                            {publishRejectionError.message}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Auto-Remove Exact Duplicates Helper Callout */}
                    {hasDuplicateErrors && (
                      <div className="p-4 rounded-xl bg-rose-950/90 border border-rose-600/80 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                        <div className="space-y-1 max-w-xl">
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>✨ Duplicate Departure Times Detected</span>
                          </div>
                          <p className="text-xs text-rose-200/90 leading-relaxed">
                            Two or more buses have the exact same route, departure time, and active weekdays. Staff can clear duplicate rows automatically in 1 click:
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleAutoDeduplicate}
                          disabled={deduplicating}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-700/40 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                        >
                          <span>{deduplicating ? '⏳' : '✨'}</span>
                          <span>{deduplicating ? 'Removing Duplicates...' : 'Auto-Remove Exact Duplicates'}</span>
                        </button>
                      </div>
                    )}

                    {uniqueBlockingErrors.some(error => error.serviceId) && <button type="button" onClick={handleDeleteInvalidRows} disabled={publishLoadingPreview}
                      className="rounded-xl bg-rose-700 px-4 py-2 text-white font-bold">Delete Invalid Rows</button>}
                    {/* Detailed list of blocking errors */}
                    <div className="space-y-2.5 pt-1">
                      <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                        List of Problem Rows & Fields:
                      </div>
                      <div className="space-y-2">
                        {uniqueBlockingErrors.map((err, idx) => {
                          const problemService = err.serviceId ? services.find((s) => s.id === err.serviceId) : null;
                          const duplicateIdMatch = /Duplicates service ([0-9a-f-]{36})/i.exec(err.message_en);
                          const duplicateOf = duplicateIdMatch ? services.find((s) => s.id === duplicateIdMatch[1]) : null;
                          const friendlyEn = duplicateOf
                            ? `Duplicate departure with ${duplicateOf.origin.en} → ${duplicateOf.destination.en} at ${formatTime12(duplicateOf.departure, 'EN')}.`
                            : err.message_en;
                          const friendlySi = duplicateOf
                            ? `මෙම මාර්ගයේ සහ වේලාවේ (${formatTime12(duplicateOf.departure, 'SI')}) වෙනත් බස් රථයක් දැනටමත් ඇත.`
                            : err.message_si;

                          return (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-slate-950/80 border border-rose-900/70 flex flex-wrap items-center justify-between gap-3 hover:border-rose-700 transition"
                            >
                              <div className="space-y-1 max-w-2xl">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-700 text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                                    {err.code}
                                  </span>
                                  {problemService ? (
                                    <span className="text-xs font-bold text-white">
                                      {problemService.origin.si} → {problemService.destination.si}{' '}
                                      <span className="text-slate-400">
                                        ({problemService.origin.en} → {problemService.destination.en})
                                      </span>{' '}
                                      · {problemService.departure || 'Missing departure'} · {problemService.operator}
                                    </span>
                                  ) : err.serviceId ? (
                                    <span className="text-xs font-mono text-slate-400">Service ID: {err.serviceId.slice(0, 8)}...</span>
                                  ) : (
                                    <span className="text-xs font-semibold text-slate-300">Field: {err.field}</span>
                                  )}
                                </div>
                                <div className="text-xs text-rose-200 font-medium">
                                  {err.field}: {friendlyEn}
                                </div>
                                {friendlySi && (
                                  <div className="text-[11px] text-rose-300/80 font-sinhala">
                                    {friendlySi}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {err.serviceId ? (
                                  <button
                                    type="button"
                                    onClick={() => handleJumpToService(err.serviceId!)}
                                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-rose-800/80 text-rose-200 text-xs font-bold transition flex items-center gap-1.5 shadow"
                                  >
                                    <span>🔍</span>
                                    <span>Jump to Problem Row</span>
                                  </button>
                                ) : err.field.startsWith('alert') ? (
                                  <button
                                    type="button"
                                    onClick={() => setActiveView('alert')}
                                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-800 text-amber-200 text-xs font-bold transition"
                                  >
                                    Go to Alert Banner →
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActiveView('settings')}
                                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition"
                                  >
                                    Go to Display Settings →
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Safety Warnings Card (Amber - Non Blocking) */}
              {(() => {
                const totalBuses = services.length;
                const removedCount = publishPreview?.diff?.removed?.length || 0;
                const isHighDeletions = removedCount >= 3 || (totalBuses > 0 && removedCount / totalBuses > 0.2);
                const isZeroActive = services.filter((s) => s.active).length === 0;
                const advisoryWarnings = publishPreview?.warnings || [];

                if (!isHighDeletions && !isZeroActive && advisoryWarnings.length === 0) return null;

                return (
                  <div className="p-5 rounded-2xl bg-slate-900 border border-amber-600/60 shadow-xl space-y-3">
                    <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
                      <span>🛡️ Timetable Advisory Notices:</span>
                    </div>

                    {advisoryWarnings.length > 0 && (
                      <details className="group rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 overflow-hidden transition">
                        <summary className="p-3 font-semibold text-slate-300 hover:text-white cursor-pointer select-none flex items-center justify-between list-none">
                          <span className="flex items-center gap-2">
                            <span>ℹ️</span>
                            <span>Show optional spelling/overnight notes ({advisoryWarnings.length})</span>
                          </span>
                          <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="p-3 pt-0 border-t border-slate-800/80 bg-slate-950/40 text-[11px] space-y-1.5 max-h-60 overflow-y-auto">
                          <ul className="list-disc list-inside space-y-1 text-slate-400">
                            {advisoryWarnings.map((w, i) => (
                              <li key={i}>
                                <span className="text-slate-300">{w.message_en}</span>{' '}
                                <span className="text-slate-500 font-sinhala">({w.message_si})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    )}

                    {isZeroActive && (
                      <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <span>⛔</span>
                          <span><strong>Critical:</strong> Zero active buses remain in schedule. Publishing will empty the TV display.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleActivateAllServices}
                          disabled={isActivatingAll}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow disabled:opacity-50 whitespace-nowrap"
                        >
                          <span>⚡</span>
                          <span>{isActivatingAll ? 'Activating...' : 'Activate All Buses'}</span>
                        </button>
                      </div>
                    )}

                    {isHighDeletions && (
                      <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200">
                        ⚠️ <strong>High deletion volume:</strong> {removedCount} buses are being deleted. Confirm this was intended.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Confirmation Gate & Publish Action */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white">Confirmation Gate</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Release Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={releaseNote}
                    onChange={(e) => setReleaseNote(e.target.value)}
                    placeholder="e.g. Updated morning Kandy timings, added Badulla weekend service"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="confirm-publish-checkbox"
                    checked={publishConfirmed}
                    onChange={(e) => setPublishConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <label
                    htmlFor="confirm-publish-checkbox"
                    className="text-xs text-slate-200 font-medium cursor-pointer select-none leading-relaxed"
                  >
                    I have checked the schedule differences and confirmed they are accurate. I understand this immediately updates the public wall TV timetable.
                  </label>
                </div>

                {(() => {
                  const allValidationErrors = [
                    ...(publishRejectionError?.errors || []),
                    ...(publishPreview?.validation && !publishPreview.validation.ok ? publishPreview.validation.errors : []),
                  ];
                  const hasBlocking = allValidationErrors.length > 0 || Boolean(publishRejectionError);
                  if (!hasBlocking) return null;

                  return (
                    <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>The schedule cannot be published while blocking validation errors exist. Use "Jump to Problem Row" or "Auto-Remove Exact Duplicates" above to resolve them.</span>
                    </div>
                  );
                })()}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveView('timetable')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  {(() => {
                    const allValidationErrors = [
                      ...(publishRejectionError?.errors || []),
                      ...(publishPreview?.validation && !publishPreview.validation.ok ? publishPreview.validation.errors : []),
                    ];
                    const hasBlocking = allValidationErrors.length > 0 || Boolean(publishRejectionError);
                    const canPublish =
                      !publishing &&
                      !publishLoadingPreview &&
                      publishPreview?.draftRevision === draftRevision &&
                      publishConfirmed &&
                      (unpublishedChangeCount > 0 || hasUnpublishedChanges) &&
                      !hasBlocking;

                    return (
                      <button
                        type="button"
                        onClick={handlePublish}
                        disabled={!canPublish}
                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                      >
                        <span>{publishing ? '⏳' : hasBlocking ? '⛔' : '🚀'}</span>
                        <span>
                          {publishing
                            ? 'Publishing to TV...'
                            : hasBlocking
                              ? `Fix ${allValidationErrors.length || 1} Blocking Error${(allValidationErrors.length || 1) > 1 ? 's' : ''} to Publish`
                              : 'Publish to TV Now'}
                        </span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </section>
          </ErrorBoundary>
        )}

        {/* ===================================================================
            SCREEN: ALERT BANNER EDITOR
           =================================================================== */}
        {activeView === 'alert' && (
          <section className="space-y-6 w-full animate-fade-in">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>⚠️ Alert Banner Editor</span>
                  {alertBanner?.enabled && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      ACTIVE ON TV
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Broadcast emergency announcements, bad weather warnings, or route diversions to the live TV masthead
                </p>
              </div>
              <div className="flex items-center gap-3">
                {alertBanner?.enabled && (
                  <button
                    type="button"
                    disabled={alertSaving}
                    onClick={handleDisableAlert}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 text-xs font-semibold border border-rose-500/30 transition disabled:opacity-50"
                  >
                    Disable Alert
                  </button>
                )}
                <button
                  type="button"
                  disabled={alertSaving}
                  onClick={() => handleSaveAlert()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>{alertSaving ? 'Saving...' : 'Save Alert to Draft'}</span>
                </button>
              </div>
            </div>

            {/* Reminder Callout after Saving */}
            {alertSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">✅</span>
                  <div>
                    <strong className="text-emerald-100">Saved to draft:</strong> Click <strong>Review &amp; Publish</strong> to push this update to the live TV display.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('publish')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition active:scale-95 whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>Review &amp; Publish →</span>
                </button>
              </div>
            )}

            {/* Error Callout */}
            {alertError && (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-3 animate-fade-in">
                <span className="text-xl">⚠️</span>
                <div>{alertError}</div>
              </div>
            )}

            {/* Main Form & Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form Card */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
                {/* Alert Status Toggle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Alert Status
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAlertEnabled(false)}
                      className={`p-3 rounded-xl border text-left text-xs font-semibold transition ${!alertEnabled
                          ? 'bg-slate-800 border-slate-600 text-white shadow'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                        }`}
                    >
                      <div className="font-bold flex items-center gap-2">
                        <span>⚪</span>
                        <span>Disabled</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        No alert banner shown on live TV
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertEnabled(true)}
                      className={`p-3 rounded-xl border text-left text-xs font-semibold transition ${alertEnabled
                          ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 shadow'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                        }`}
                    >
                      <div className="font-bold flex items-center gap-2">
                        <span>🔴</span>
                        <span>Active</span>
                      </div>
                      <div className="text-[11px] text-amber-300/60 font-normal mt-0.5">
                        Show banner on live TV masthead
                      </div>
                    </button>
                  </div>
                </div>

                {/* Severity Level */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Severity Level
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['INFO', 'WARNING', 'CRITICAL'] as const).map((sev) => {
                      const isSelected = alertSeverity === sev;
                      const badgeStyle =
                        sev === 'INFO'
                          ? 'border-sky-500/60 text-sky-300 bg-sky-950/40'
                          : sev === 'WARNING'
                            ? 'border-amber-500/60 text-amber-300 bg-amber-950/40'
                            : 'border-rose-500/60 text-rose-300 bg-rose-950/40';
                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setAlertSeverity(sev)}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition ${isSelected
                              ? `${badgeStyle} shadow-lg ring-1 ring-white/20`
                              : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                            }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{sev === 'INFO' ? 'ℹ️' : sev === 'WARNING' ? '⚠️' : '🚨'}</span>
                            <span>{sev}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal mt-1">
                            {sev === 'INFO' ? 'General Notice' : sev === 'WARNING' ? 'Important Warning' : 'Critical Alert'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sinhala Text Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Sinhala Alert Message (සිංහල නිවේදනය) <span className="text-rose-400">*</span>
                    </label>
                    <span className={`text-[11px] font-mono ${alertTextSi.length > 140 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                      {alertTextSi.length} / 140
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={140}
                    value={alertTextSi}
                    onChange={(e) => setAlertTextSi(e.target.value)}
                    placeholder="උදා: අයහපත් කාලගුණය හේතුවෙන් මහනුවර මාර්ගයේ බස් රථ ප්‍රමාද විය හැක."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 text-sm focus:border-blue-500 focus:outline-none transition leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Sinhala script text shown at the top of the TV screen and passenger mobile view.
                  </p>
                </div>

                {/* English Text Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      English Alert Message <span className="text-rose-400">*</span>
                    </label>
                    <span className={`text-[11px] font-mono ${alertTextEn.length > 140 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                      {alertTextEn.length} / 140
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={140}
                    value={alertTextEn}
                    onChange={(e) => setAlertTextEn(e.target.value)}
                    placeholder="e.g. Due to bad weather, Kandy route departures may experience delays."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 text-sm focus:border-blue-500 focus:outline-none transition leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    English Latin text paired with the Sinhala announcement.
                  </p>
                </div>

                {/* Expiry Date/Time Option */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertHasExpiry}
                      onChange={(e) => setAlertHasExpiry(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      Set automatic expiration date &amp; time (Asia/Colombo)
                    </span>
                  </label>

                  {alertHasExpiry && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Expiry Date</label>
                        <input
                          type="date"
                          value={alertExpiryDate}
                          onChange={(e) => setAlertExpiryDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Expiry Time (24h)</label>
                        <input
                          type="time"
                          value={alertExpiryTime}
                          onChange={(e) => setAlertExpiryTime(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    When expired, the TV will automatically hide the banner without requiring manual staff intervention.
                  </p>
                </div>

                {/* Save Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={alertSaving}
                    onClick={() => handleSaveAlert()}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition active:scale-95 disabled:opacity-50"
                  >
                    {alertSaving ? 'Saving to Draft...' : 'Save Alert to Draft'}
                  </button>
                </div>
              </div>

              {/* Live TV Preview Card */}
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>📺 Live TV Masthead Preview</span>
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      16:9 Display View
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    This is an exact preview of how the alert banner will render at the top of the Mahiyanganaya Bus Stand wall TV.
                  </p>

                  {/* TV Screen Container Mock */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl space-y-3">
                    {/* Simulated TV Masthead */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="text-xs font-bold text-slate-300">
                        {stationName.si || 'මහියංගනය බස් නැවතුම්පොළ'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        12:45 PM
                      </div>
                    </div>

                    {/* Alert Banner Component as seen on TV */}
                    {alertEnabled ? (
                      <div
                        className={`p-3 rounded-lg border flex items-start gap-3 transition-all ${alertSeverity === 'INFO'
                            ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
                            : alertSeverity === 'WARNING'
                              ? 'bg-amber-950/60 border-amber-500/60 text-amber-200'
                              : 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                          }`}
                      >
                        <span className="text-lg shrink-0 mt-0.5">
                          {alertSeverity === 'INFO' ? 'ℹ️' : alertSeverity === 'WARNING' ? '⚠️' : '🚨'}
                        </span>
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-bold text-xs leading-snug">
                            {alertTextSi.trim() || 'සිංහල නිවේදන පාඨය මෙතැන දිස්වේ...'}
                          </div>
                          <div className="text-[11px] opacity-80 leading-snug">
                            {alertTextEn.trim() || 'English announcement text appears here...'}
                          </div>
                          {alertHasExpiry && alertExpiryDate && alertExpiryTime && (
                            <div className="text-[10px] opacity-60 font-mono pt-1">
                              Valid until: {alertExpiryDate} {alertExpiryTime}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-900/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                        Alert banner is currently <strong>Disabled</strong>. The timetable table will take up the full screen height.
                      </div>
                    )}

                    {/* Simulated Timetable Rows Mock */}
                    <div className="space-y-1.5 opacity-30 pt-1">
                      <div className="h-6 rounded bg-slate-800 flex items-center px-3 justify-between text-[10px] text-slate-400">
                        <span>මහනුවර / Kandy</span>
                        <span>01:15 PM</span>
                      </div>
                      <div className="h-6 rounded bg-slate-800 flex items-center px-3 justify-between text-[10px] text-slate-400">
                        <span>කොළඹ / Colombo</span>
                        <span>01:30 PM</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Important Notice Card */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
                  <div className="font-bold text-slate-200 flex items-center gap-2">
                    <span>💡 Publishing Workflow</span>
                  </div>
                  <p>
                    Saving an alert writes it directly into the <strong>draft schedule</strong>. The live wall TV will not show the new banner until you click <strong>Review &amp; Publish to TV</strong>.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 3: TV PRESENTATION CONTROL
           =================================================================== */}
        {activeView === 'tv-control' && (
          <section className="space-y-6 w-full animate-fade-in">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>📺 TV Slide Presentation Control</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Freeze the live TV display on a specific slide during opening presentations, or resume auto-scrolling
                </p>
              </div>
              <button
                type="button"
                onClick={handleTvReload}
                disabled={reloadingTv}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition"
              >
                <span>🔄</span>
                <span>{reloadingTv ? 'Sending Reload...' : 'Force TV App Reload'}</span>
              </button>
            </div>

            {/* Current State Indicator */}
            <div
              className={`p-5 rounded-2xl border shadow-xl flex items-center justify-between gap-4 ${
                tvHoldState.mode === 'auto'
                  ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                  : tvHoldState.mode === 'frequent'
                    ? 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                    : tvHoldState.mode === 'credits'
                      ? 'bg-indigo-950/40 border-indigo-700/60 text-indigo-200'
                      : 'bg-blue-950/40 border-blue-700/60 text-blue-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{tvHoldState.mode === 'auto' ? '🔄' : '⏸️'}</span>
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold">Current Live TV Mode:</div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {tvHoldState.mode === 'auto'
                      ? 'Auto-Scrolling (10 Seconds Per Page)'
                      : tvHoldState.mode === 'frequent'
                        ? 'Frozen on Frequent Services Slide (Every 15 Mins)'
                        : tvHoldState.mode === 'credits'
                          ? 'Holding: Credits / QR Code Slide'
                          : `Holding: Page ${tvHoldState.page || 1}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Hold Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hold Frequent Services */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
                <div className="font-bold text-white text-sm">Hold on Frequent Services Slide</div>
                <p className="text-xs text-slate-400">
                  Freezes the live TV display on the 15-minute frequent departures slide (Badulla, Kandy, Sacred City).
                </p>
                <button
                  type="button"
                  disabled={tvHoldSaving || tvHoldState.mode === 'frequent'}
                  onClick={() => handleSetTvHold('frequent')}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs shadow transition active:scale-95 disabled:opacity-50 ${
                    tvHoldState.mode === 'frequent'
                      ? 'bg-amber-950/60 border border-amber-500/60 text-amber-300 cursor-not-allowed opacity-90'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {tvHoldState.mode === 'frequent' ? 'Active: Frozen on Frequent Services' : 'Hold Frequent Services Slide'}
                </button>
              </div>

              {/* Hold Credits */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
                <div className="font-bold text-white text-sm">Hold on Credits / QR Slide</div>
                <p className="text-xs text-slate-400">
                  Freezes the live TV display on the final slide showing the QR code, Android app link, and developer credits.
                </p>
                <button
                  type="button"
                  disabled={tvHoldSaving || tvHoldState.mode === 'credits'}
                  onClick={() => handleSetTvHold('credits')}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs shadow transition active:scale-95 disabled:opacity-50 ${
                    tvHoldState.mode === 'credits'
                      ? 'bg-indigo-950/60 border border-indigo-500/60 text-indigo-300 cursor-not-allowed opacity-90'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  }`}
                >
                  {tvHoldState.mode === 'credits' ? 'Active: Frozen on Credits' : 'Hold Credits / QR Slide'}
                </button>
              </div>

              {/* Hold Page 1 */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
                <div className="font-bold text-white text-sm">Hold on Page 1</div>
                <p className="text-xs text-slate-400">
                  Freezes the live timetable on the very first page of upcoming departures.
                </p>
                <button
                  type="button"
                  disabled={tvHoldSaving || (tvHoldState.mode === 'page' && (tvHoldState.page === 1 || !tvHoldState.page))}
                  onClick={() => handleSetTvHold('page', 1)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs shadow transition active:scale-95 disabled:opacity-50 ${
                    tvHoldState.mode === 'page' && (tvHoldState.page === 1 || !tvHoldState.page)
                      ? 'bg-blue-950/60 border border-blue-500/60 text-blue-300 cursor-not-allowed opacity-90'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                  }`}
                >
                  {tvHoldState.mode === 'page' && (tvHoldState.page === 1 || !tvHoldState.page)
                    ? 'Active: Frozen on Page 1'
                    : 'Hold Page 1'}
                </button>
              </div>

              {/* Hold Specific Page */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
                <div className="font-bold text-white text-sm">Hold on Page #</div>
                <p className="text-xs text-slate-400">
                  Enter a specific page number to keep on screen.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customTvHoldPage}
                    onChange={(e) => setCustomTvHoldPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold text-center"
                  />
                  <button
                    type="button"
                    disabled={tvHoldSaving || (tvHoldState.mode === 'page' && tvHoldState.page === customTvHoldPage)}
                    onClick={() => handleSetTvHold('page', customTvHoldPage)}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs shadow transition active:scale-95 disabled:opacity-50 ${
                      tvHoldState.mode === 'page' && tvHoldState.page === customTvHoldPage
                        ? 'bg-slate-800/80 border border-blue-500/60 text-blue-300 cursor-not-allowed opacity-90'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {tvHoldState.mode === 'page' && tvHoldState.page === customTvHoldPage
                      ? `Active: Page ${customTvHoldPage}`
                      : `Hold Page ${customTvHoldPage}`}
                  </button>
                </div>
              </div>

              {/* Resume Auto-Scroll */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 md:col-span-2">
                <div className="font-bold text-white text-sm">Resume Normal Auto-Rotation</div>
                <p className="text-xs text-slate-400">
                  Restores normal 10-second automatic page cycling through all schedule pages.
                </p>
                <button
                  type="button"
                  disabled={tvHoldSaving || tvHoldState.mode === 'auto'}
                  onClick={() => handleSetTvHold('auto')}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-50 ${
                    tvHoldState.mode === 'auto'
                      ? 'bg-emerald-950/60 border border-emerald-500/60 text-emerald-300 cursor-not-allowed opacity-90'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  }`}
                >
                  {tvHoldState.mode === 'auto' ? 'Active: 10s Auto-Scroll Running' : 'Resume 10s Auto-Scroll'}
                </button>
              </div>
            </div>

            {/* Frequent Services Slide Live Editor */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🚌</span>
                    <span>Frequent Bus Services Slide Content</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Edit the header, route descriptions, and right-side yellow frequency badges displayed on the TV slide. Changes update live on the TV without redeploying.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFrequentServices}
                    disabled={frequentConfigSaving}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition disabled:opacity-50"
                  >
                    Reset Defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFrequentServices}
                    disabled={frequentConfigSaving}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>💾</span>
                    <span>{frequentConfigSaving ? 'Saving...' : 'Save & Update Live TV'}</span>
                  </button>
                </div>
              </div>

              {/* Slide Header Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Sinhala Slide Header:
                  </label>
                  <input
                    type="text"
                    value={frequentConfig.headerSi}
                    onChange={(e) =>
                      setFrequentConfig((prev) => ({ ...prev, headerSi: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-amber-500 focus:outline-none"
                    placeholder="නිතර පිටත්වන ගමනාන්ත"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    English Slide Header / Subtitle:
                  </label>
                  <input
                    type="text"
                    value={frequentConfig.headerEn}
                    onChange={(e) =>
                      setFrequentConfig((prev) => ({ ...prev, headerEn: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-amber-500 focus:outline-none"
                    placeholder="FREQUENT BUS SERVICES"
                  />
                </div>
              </div>

              {/* 3 Card Editors */}
              <div className="space-y-4">
                {frequentConfig.cards.map((card, idx) => (
                  <div
                    key={card.id || idx}
                    className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-white">{card.routeLabel || `Route ${idx + 1}`}</span>
                      </div>
                      {/* Live Mini Preview of Yellow Badge */}
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400 text-slate-950 shadow-sm border border-amber-300">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <div className="text-[10px] font-black leading-tight text-center">
                          <div>{card.badgeEn || '15 MIN'}</div>
                          <div className="text-[8px] font-bold">{card.badgeSi || 'විනාඩි 15'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Left: Sinhala & English Description */}
                      <div className="lg:col-span-2 space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            Sinhala Description (සිංහල විස්තරය):
                          </label>
                          <textarea
                            rows={2}
                            value={card.textSi}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFrequentConfig((prev) => ({
                                ...prev,
                                cards: prev.cards.map((c, i) => (i === idx ? { ...c, textSi: val } : c)),
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-amber-500 focus:outline-none resize-none"
                            placeholder="මහියංගණ සිට..."
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            English Description:
                          </label>
                          <textarea
                            rows={2}
                            value={card.textEn}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFrequentConfig((prev) => ({
                                ...prev,
                                cards: prev.cards.map((c, i) => (i === idx ? { ...c, textEn: val } : c)),
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-amber-500 focus:outline-none resize-none"
                            placeholder="Mahiyanganaya to..."
                          />
                        </div>
                      </div>

                      {/* Right: Yellow Badge Inputs */}
                      <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                        <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                          Yellow Badge Time:
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">
                            Badge English (top):
                          </label>
                          <input
                            type="text"
                            value={card.badgeEn}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFrequentConfig((prev) => ({
                                ...prev,
                                cards: prev.cards.map((c, i) => (i === idx ? { ...c, badgeEn: val } : c)),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:border-amber-500 focus:outline-none"
                            placeholder="15 MIN"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">
                            Badge Sinhala (bottom):
                          </label>
                          <input
                            type="text"
                            value={card.badgeSi}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFrequentConfig((prev) => ({
                                ...prev,
                                cards: prev.cards.map((c, i) => (i === idx ? { ...c, badgeSi: val } : c)),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:border-amber-500 focus:outline-none"
                            placeholder="විනාඩි 15"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Action Bar */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveFrequentServices}
                  disabled={frequentConfigSaving}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  <span>💾</span>
                  <span>{frequentConfigSaving ? 'Saving Changes...' : 'Save & Update Live TV'}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 4: STAFF & USERS (ADMIN ONLY)
           =================================================================== */}
        {activeView === 'users' && currentUser?.role === 'ADMIN' && (
          <section className="space-y-6 w-full animate-fade-in">
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>👥 Staff & Users Management</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage staff accounts and permissions for the admin portal
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserFormData({ login_id: '', display_name: '', role: 'EDITOR' });
                  setUserFormError(null);
                  setIsAddUserModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95 self-start sm:self-auto"
              >
                <span>+</span>
                <span>Add Staff Member</span>
              </button>
            </div>

            {/* Users Table */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Last Login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {staffUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No staff accounts recorded yet.
                      </td>
                    </tr>
                  ) : (
                    staffUsers.map((u) => {
                      const isSelf = currentUser?.email.toLowerCase() === u.login_id.toLowerCase();
                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{u.display_name}</span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.login_id}</div>
                          </td>
                          <td className="py-3.5 px-3">
                            {isSelf ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${u.role === 'ADMIN'
                                    ? 'bg-purple-950/80 text-purple-300 border-purple-800/60'
                                    : 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                                  }`}
                              >
                                {u.role}
                              </span>
                            ) : (
                              <select
                                value={u.role}
                                disabled={userRoleUpdating === u.id}
                                onChange={(e) => {
                                  const newRole = e.target.value as 'ADMIN' | 'EDITOR';
                                  void handleUpdateUserRole(u.id, u.display_name, newRole);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition focus:outline-none ${u.role === 'ADMIN'
                                    ? 'bg-purple-950 text-purple-200 border-purple-700 hover:border-purple-500'
                                    : 'bg-blue-950 text-blue-200 border-blue-700 hover:border-blue-500'
                                  }`}
                                title={`Change role for ${u.display_name}`}
                              >
                                <option value="ADMIN" className="bg-slate-900 text-purple-300 font-bold">ADMIN</option>
                                <option value="EDITOR" className="bg-slate-900 text-blue-300 font-bold">EDITOR</option>
                              </select>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.disabled === 0
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                            >
                              {u.disabled === 0 ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-slate-400">{formatDate(u.last_login_at)}</td>
                          <td className="py-3.5 px-4 text-right">
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const newDisabled = u.disabled === 0 ? 1 : 0;
                                  const res = await apiFetch(`/api/admin/users/${u.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ disabled: newDisabled }),
                                  });
                                  if (res.ok) void loadStaffUsers();
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${u.disabled === 0
                                    ? 'bg-rose-950/40 text-rose-300 border-rose-800 hover:bg-rose-900/60'
                                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
                                  }`}
                              >
                                {u.disabled === 0 ? 'Disable' : 'Enable'}
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

            {/* Standalone MTBA Admin Mobile App Section */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-amber-700/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <span className="text-3xl">🛡️</span>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>MTBA — Admin Portal App</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                      Independent PWA & APK Slot
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    Dedicated administrative portal for staff members with zero conflict with the commuter MTB timetable app. Scoped strictly to <code>/admin/</code> with its own manifest and service worker.
                  </p>
                </div>
              </div>

              {hasMtbaApk ? (
                <a
                  href="/downloads/mtba-admin.apk"
                  download="mtba-admin.apk"
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95 whitespace-nowrap self-start sm:self-auto"
                >
                  <span>⬇️</span>
                  <span>Download MTBA Admin APK</span>
                </a>
              ) : (
                <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleAdminPwaInstall}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95 whitespace-nowrap"
                  >
                    <span>⚡</span>
                    <span>{pwaInstalled ? 'MTBA Installed ✓' : 'Install MTBA App (PWA)'}</span>
                  </button>
                  <span className="text-[10px] text-slate-500">
                    Direct APK: Drop <code>mtba-admin.apk</code> into <code>/downloads/</code>
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN: DISPLAY SETTINGS & STATION INFO (ADMIN ONLY)
           =================================================================== */}
        {activeView === 'settings' && (
          <section className="space-y-6 w-full animate-fade-in">
            {currentUser?.role !== 'ADMIN' ? (
              <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                <span className="text-4xl">🔒</span>
                <h3 className="text-base font-bold text-white">Administrator Access Required</h3>
                <p className="text-xs text-slate-400">
                  Only staff members with the ADMIN role can modify display settings and station branding.
                </p>
              </div>
            ) : (
              <>
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span>⚙️ Display Settings &amp; Station Info</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                        ADMIN ONLY
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Configure TV screen timing, rows per page, safe margins, and station branding
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={settingsSaving}
                      onClick={handleResetSettings}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                    >
                      Reset to Defaults
                    </button>
                    <button
                      type="button"
                      disabled={settingsSaving}
                      onClick={() => handleSaveSettings()}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <span>{settingsSaving ? 'Saving...' : 'Save Settings to Draft'}</span>
                    </button>
                  </div>
                </div>

                {/* Reminder Callout after Saving */}
                {settingsSuccessMsg && (
                  <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">✅</span>
                      <div>
                        <strong className="text-emerald-100">Saved to draft:</strong> Click <strong>Review &amp; Publish</strong> to push this update to the live TV display.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('publish')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition active:scale-95 whitespace-nowrap flex items-center gap-1.5"
                    >
                      <span>Review &amp; Publish →</span>
                    </button>
                  </div>
                )}

                {/* Error Callout */}
                {settingsError && (
                  <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-3 animate-fade-in">
                    <span className="text-xl">⚠️</span>
                    <div>{settingsError}</div>
                  </div>
                )}

                {/* TV Timetable Display Timing Settings Card */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>📺 Timetable Timing Settings</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Tune timetable departure retention, highlight timing, and schedule lookahead. TV presentation layout is locked to fixed 4 rows per page and 10 seconds auto-scroll.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Departed Grace Minutes */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <label className="block text-xs font-semibold text-slate-200">
                        (1) Departed Grace (Minutes)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={settingsForm.departedGraceMinutes}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, departedGraceMinutes: parseInt(e.target.value, 10) || 15 })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Keep departed buses visible as &quot;Departed / පිටත් විය&quot; (0–60m, default 15).
                      </p>
                    </div>

                    {/* Soon Threshold Minutes */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <label className="block text-xs font-semibold text-slate-200">
                        (2) Soon Highlight (Minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={60}
                        value={settingsForm.soonThresholdMinutes}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, soonThresholdMinutes: parseInt(e.target.value, 10) || 15 })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Minutes before departure to highlight row in yellow/leaving soon (5–60m, default 15).
                      </p>
                    </div>

                    {/* Lookahead Hours */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <label className="block text-xs font-semibold text-slate-200">
                        (3) Schedule Lookahead (Hours)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={settingsForm.lookaheadHours}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, lookaheadHours: parseInt(e.target.value, 10) || 8 })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400 leading-tight">
                        How far ahead to look for departures from current Colombo time (1–24h, default 8).
                      </p>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={settingsSaving}
                      onClick={handleResetSettings}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                    >
                      Reset to Defaults
                    </button>
                    <button
                      type="button"
                      disabled={settingsSaving}
                      onClick={() => handleSaveSettings()}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                      <span>{settingsSaving ? 'Saving...' : 'Save Settings to Draft'}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ===================================================================
            SCREEN 5: REPORTS & PASSENGER FEEDBACK
           =================================================================== */}
        {activeView === 'reports' && (
          <section className="space-y-6 w-full animate-fade-in">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>📊 Reports & Passenger Feedback</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Privacy-safe QR scan analytics and commuter feedback reports
                </p>
              </div>
              <button
                type="button"
                onClick={loadReportsData}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
              >
                🔄 Refresh Reports
              </button>
            </div>

            {/* Error Banner when reports fail to load */}
            {reportsError && (
              <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-800 text-rose-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <div className="font-bold">Error Loading Analytics & Reports</div>
                    <div className="text-[11px] text-rose-300">{reportsError}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadReportsData}
                  className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-white rounded-xl font-bold transition shadow"
                >
                  Retry Loading
                </button>
              </div>
            )}

            {/* QR Scan Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <div className="text-xs text-slate-400 font-medium">Today&apos;s Unique Visitors</div>
                <div className="text-3xl font-black text-blue-400 mt-2">
                  {qrStats.find((s) => s.scan_date === todayStr)?.unique_visitors ?? 0}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <div className="text-xs text-slate-400 font-medium">Today&apos;s Total Scans</div>
                <div className="text-3xl font-black text-emerald-400 mt-2">
                  {qrStats.find((s) => s.scan_date === todayStr)?.total_scans ?? 0}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <div className="text-xs text-slate-400 font-medium">All-Time Recorded Scans</div>
                <div className="text-3xl font-black text-purple-400 mt-2">
                  {qrStats.reduce((sum, s) => sum + s.total_scans, 0)}
                </div>
              </div>
            </div>

            {/* Daily Scans Bar Chart */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Daily QR Scans Activity (Last 14 Days)</span>
                <span className="text-xs font-normal text-slate-400">Total Scans per day</span>
              </h3>

              {qrStats.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No QR scan activity recorded yet. Scans from passengers scanning the wall TV QR code will appear here.
                </div>
              ) : (
                (() => {
                  const sorted = [...qrStats]
                    .sort((a, b) => a.scan_date.localeCompare(b.scan_date))
                    .slice(-14);
                  const maxVal = Math.max(...sorted.map((s) => s.total_scans), 10);

                  return (
                    <div className="pt-4 pb-2">
                      <div className="flex items-end justify-between gap-2 h-44 border-b border-slate-800 pb-2">
                        {sorted.map((day) => {
                          const heightPct = Math.round((day.total_scans / maxVal) * 100);
                          const dateLabel = day.scan_date.slice(5); // MM-DD
                          return (
                            <div key={day.scan_date} className="flex-1 flex flex-col items-center gap-1.5 group">
                              <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition">
                                {day.total_scans}
                              </span>
                              <div className="w-full max-w-[36px] bg-slate-800 rounded-t-lg h-32 flex items-end overflow-hidden">
                                <div
                                  style={{ height: `${Math.max(6, heightPct)}%` }}
                                  className="w-full bg-blue-600 group-hover:bg-blue-500 rounded-t-lg transition-all"
                                  title={`${day.scan_date}: ${day.total_scans} scans, ${day.unique_visitors} unique visitors`}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">{dateLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Passenger Issue Reports & Suggestions */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Passenger Issue Reports & Suggestions ({suggestions.length})</span>
                <span className="text-xs font-normal text-slate-400">Anonymous commuter feedback</span>
              </h3>

              {suggestions.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No commuter suggestions or reports submitted yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {suggestions.map((item) => (
                    <div key={item.id} className="py-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.category === 'WRONG_TIME'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : item.category === 'MISSING_BUS'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                        >
                          {item.category}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDate(item.created_at)}</span>
                        {item.route_hint && (
                          <span className="text-[11px] text-blue-300 font-medium">
                            Route: {item.route_hint}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{item.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ===================================================================
          MODAL 1: ADD / EDIT / DUPLICATE BUS MODAL
         =================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-6 z-10 max-h-[90vh] overflow-y-auto animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🚌</span>
                <h3 className="text-base font-bold text-white">
                  {isEditMode ? 'Edit Bus Schedule' : 'Add / Duplicate Bus Schedule'}
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

            {/* Form */}
            <form onSubmit={handleSaveService} className="space-y-5">
              {/* Validation Error Alert Box */}
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>❌</span>
                    <span>Validation Failed:</span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{formError}</pre>
                </div>
              )}

              {/* Destination Section */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">
                  ගමනාන්තය · Destination *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Sinhala (සිංහල) *</label>
                    <input
                      type="text"
                      required
                      value={formData.destSi}
                      onChange={(e) => setFormData((prev) => ({ ...prev, destSi: e.target.value }))}
                      placeholder="e.g. කොළඹ"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('destination.si') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">English *</label>
                    <input
                      type="text"
                      required
                      value={formData.destEn}
                      onChange={(e) => setFormData((prev) => ({ ...prev, destEn: e.target.value }))}
                      placeholder="e.g. Colombo"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('destination.en') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                </div>
              </div>

              {/* Via Route Section (Optional) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">
                    හරහා · Via Route <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                  </label>
                  {(formData.viaSi || formData.viaEn) ? (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, viaSi: '', viaEn: '' }))}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                      title="Clear via route (Direct bus)"
                    >
                      ✕ Clear / Direct
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 italic">Direct route</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Sinhala (සිංහල)</label>
                    <input
                      type="text"
                      value={formData.viaSi}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => {
                          const known = KNOWN_PLACES.find((p) => p.si === val.trim());
                          return {
                            ...prev,
                            viaSi: val,
                            viaEn: !prev.viaEn && known ? known.en : prev.viaEn,
                          };
                        });
                      }}
                      placeholder="e.g. කදුරුවෙල, දඹුල්ල, මහඔය"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('via.si') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">English</label>
                    <input
                      type="text"
                      value={formData.viaEn}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => {
                          const known = KNOWN_PLACES.find((p) => p.en.toLowerCase() === val.trim().toLowerCase());
                          return {
                            ...prev,
                            viaEn: val,
                            viaSi: !prev.viaSi && known ? known.si : prev.viaSi,
                          };
                        });
                      }}
                      placeholder="e.g. Kaduruwela, Dambulla, Mahaoya"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('via.en') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                </div>
              </div>

              {/* Origin Section */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">
                  ආරම්භය · From (Origin) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Sinhala (සිංහල) *</label>
                    <input
                      type="text"
                      required
                      value={formData.originSi}
                      onChange={(e) => setFormData((prev) => ({ ...prev, originSi: e.target.value }))}
                      placeholder="e.g. මහියංගනය"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('origin.si') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">English *</label>
                    <input
                      type="text"
                      required
                      value={formData.originEn}
                      onChange={(e) => setFormData((prev) => ({ ...prev, originEn: e.target.value }))}
                      placeholder="e.g. Mahiyanganaya"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-950 border text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${formInvalidFields.has('origin.en') ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-800'
                        }`}
                    />
                  </div>
                </div>
              </div>

              {/* Departure Time */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  පිටත්වීම · Departure Time (12-Hour) *
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={formData.depHour}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depHour: parseInt(e.target.value, 10) }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-slate-500 font-bold">:</span>
                  <select
                    value={formData.depMinute}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depMinute: parseInt(e.target.value, 10) }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <select
                    value={formData.depMeridiem}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depMeridiem: e.target.value as 'AM' | 'PM' }))}
                    className="w-20 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              {/* Arrival Time */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">
                    පැමිණීම · Arrival Time (12-Hour){' '}
                    <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                  </label>
                  {formData.hasArrival ? (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, hasArrival: false }))}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
                      title="Clear arrival time (for originating buses)"
                    >
                      ✕ Clear / No Arrival
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 italic">None (Originating bus)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={formData.hasArrival ? formData.arrHour : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setFormData((prev) => ({ ...prev, hasArrival: false }));
                      } else {
                        setFormData((prev) => ({ ...prev, hasArrival: true, arrHour: parseInt(val, 10) }));
                      }
                    }}
                    className={`flex-1 px-3 py-2 rounded-xl bg-slate-950 border text-xs font-bold focus:outline-none focus:border-blue-500 ${
                      formInvalidFields.has('arrival')
                        ? 'border-red-500 ring-1 ring-red-500 text-white'
                        : formData.hasArrival
                          ? 'border-slate-800 text-white'
                          : 'border-slate-800 text-slate-500'
                    }`}
                  >
                    <option value="">-- (No Arrival Time)</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className={`font-bold ${formData.hasArrival ? 'text-slate-500' : 'text-slate-700'}`}>:</span>
                  <select
                    value={formData.arrMinute}
                    disabled={!formData.hasArrival}
                    onChange={(e) => setFormData((prev) => ({ ...prev, arrMinute: parseInt(e.target.value, 10) }))}
                    className={`flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold focus:outline-none focus:border-blue-500 ${
                      !formData.hasArrival ? 'opacity-40 cursor-not-allowed text-slate-600' : 'text-white'
                    }`}
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <select
                    value={formData.arrMeridiem}
                    disabled={!formData.hasArrival}
                    onChange={(e) => setFormData((prev) => ({ ...prev, arrMeridiem: e.target.value as 'AM' | 'PM' }))}
                    className={`w-20 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold focus:outline-none focus:border-blue-500 ${
                      !formData.hasArrival ? 'opacity-40 cursor-not-allowed text-slate-600' : 'text-white'
                    }`}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              {/* Operator & Service Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Operator · සේවාව</label>
                  <select
                    value={formData.operator}
                    onChange={(e) => setFormData((prev) => ({ ...prev, operator: e.target.value as 'CTB' | 'PVT' }))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="PVT">Private / PVT (පුද්ගලික)</option>
                    <option value="CTB">SLTB / CTB (ලංගම)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Service Type · වර්ගය</label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) => setFormData((prev) => ({ ...prev, serviceType: e.target.value as 'NORMAL' | 'SEMI_LUXURY' | 'LUXURY' | 'EXPRESS' }))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="NORMAL">Normal / සාමාන්‍ය</option>
                    <option value="SEMI_LUXURY">Semi-Luxury / අර්ධ සුඛෝපභෝගී</option>
                    <option value="LUXURY">Luxury / සුඛෝපභෝගී</option>
                    <option value="EXPRESS">Express / සීඝ්‍රගාමී</option>
                  </select>
                </div>
              </div>

              {/* Days of Week Checkboxes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Days of Operation · ධාවනය වන දින *</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, days: [1, 2, 3, 4, 5, 6, 7] }))}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    >
                      Every day
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, days: [1, 2, 3, 4, 5] }))}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, days: [6, 7] }))}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    >
                      Weekends
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[
                    { day: 1, label: 'Mon', si: 'සඳුදා' },
                    { day: 2, label: 'Tue', si: 'අඟහ' },
                    { day: 3, label: 'Wed', si: 'බදාදා' },
                    { day: 4, label: 'Thu', si: 'බ්‍රහස්' },
                    { day: 5, label: 'Fri', si: 'සිකු' },
                    { day: 6, label: 'Sat', si: 'සෙන' },
                    { day: 7, label: 'Sun', si: 'ඉරිදා' },
                  ].map(({ day, label, si }) => {
                    const isSelected = formData.days.some((d) => normalizeDayNum(d) === day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => {
                            const newDays = isSelected
                              ? prev.days.filter((d) => normalizeDayNum(d) !== day)
                              : [...prev.days.filter((d) => normalizeDayNum(d) !== day), day].sort();
                            return { ...prev, days: newDays };
                          })
                        }
                        className={`p-2 rounded-xl text-center text-xs font-semibold border transition ${isSelected
                            ? 'bg-blue-600 text-white border-blue-500 shadow'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                      >
                        <div>{label}</div>
                        <div className="text-[10px] opacity-75">{si}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : isEditMode ? 'Update Bus' : 'Save Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 2: DELETE BUS CONFIRMATION MODAL
         =================================================================== */}
      {deletingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeletingService(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-scale-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-base font-bold text-white">Delete Bus Schedule</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete the bus to{' '}
              <strong className="text-white">
                {deletingService.destination.si} ({deletingService.destination.en})
              </strong>{' '}
              departing at <strong className="text-white">{formatTime12(deletingService.departure, 'EN')}</strong>?
            </p>
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingService(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingSaving}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition disabled:opacity-50"
              >
                {deletingSaving ? 'Deleting...' : 'Delete Bus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 3: ADD STAFF MEMBER MODAL
         =================================================================== */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">👤</span>
                <h3 className="text-base font-bold text-white">Add Staff / Admin</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              {userFormError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs">
                  ⚠️ {userFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="staffmember@gmail.com"
                  value={userFormData.login_id}
                  onChange={(e) => setUserFormData((prev) => ({ ...prev, login_id: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kamal Perera"
                  value={userFormData.display_name}
                  onChange={(e) => setUserFormData((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Role *</label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData((prev) => ({ ...prev, role: e.target.value as 'ADMIN' | 'EDITOR' }))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="EDITOR">EDITOR — (Can add/edit/publish bus schedules only)</option>
                  <option value="ADMIN">ADMIN — (Full access + manage staff)</option>
                </select>
              </div>

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
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition disabled:opacity-60"
                >
                  {userFormSaving ? 'Adding...' : 'Add Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 4: SMART CSV / EXCEL TIMETABLE IMPORTER
         =================================================================== */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsImportModalOpen(false)} />
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-6 z-10 max-h-[90vh] overflow-y-auto animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📥</span>
                <div>
                  <h3 className="text-base font-bold text-white">Import Timetable (CSV / Excel / JSON)</h3>
                  <span className="text-xs text-slate-400">Supports .xlsx, .xls, .csv, and exported .json schedule files</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {importError && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs">
                ⚠️ {importError}
              </div>
            )}

            {/* STEP 1: SELECT FILE */}
            {importStep === 'SELECT' && (
              <div className="space-y-4">
                <div className="p-8 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl text-center space-y-3 bg-slate-950/40 transition">
                  <span className="text-4xl block">📊</span>
                  <div className="text-sm font-bold text-white">Choose Spreadsheet or JSON File</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Select a .xlsx, .csv, or .json timetable (such as mahiyanganaya_schedule.json).
                  </p>
                  <label className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 cursor-pointer transition active:scale-95">
                    Browse Files
                    <input
                      type="file"
                      accept=".csv, .tsv, .txt, .xlsx, .xls, .json, application/json"
                      onChange={handleFileSelected}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* STEP 2: COLUMN MAPPING */}
            {importStep === 'MAPPING' && (
              <div className="space-y-5">
                <div className="text-xs text-slate-300">
                  Detected <strong className="text-white">{importHeaders.length} columns</strong> and{' '}
                  <strong className="text-white">{importRawRows.length} rows</strong> in{' '}
                  <span className="font-mono text-blue-300">{importFile?.name}</span>. Confirm the column mappings below:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {(Object.keys(columnLabels) as Array<keyof typeof columnLabels>).map(key => (
                    <label key={key} className="block text-slate-300 font-semibold">
                      {columnLabels[key]}
                      <select value={colMapping[key]} onChange={e => setColMapping(previous => ({ ...previous, [key]: Number(e.target.value) }))}
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white">
                        <option value={-1}>Not supplied / exact known-place lookup only</option>
                        {importHeaders.map((header, index) => <option key={index} value={index}>{`Col ${index + 1}: ${header}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>

                {/* Import Mode Selection */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white">Import Mode:</div>
                  <div className="space-y-2 text-xs">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'MERGE'}
                        onChange={() => setImportMode('MERGE')}
                        className="mt-0.5 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <strong className="text-emerald-300">Merge & Skip Duplicates (Recommended)</strong>
                        <p className="text-slate-400 text-[11px]">
                          Adds new buses to existing timetable. Skips rows where destination + departure + operator already exists.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'REPLACE'}
                        onChange={() => setImportMode('REPLACE')}
                        className="mt-0.5 text-blue-600 focus:ring-0"
                      />
                      <div>
                        <strong className="text-amber-300">Replace All Existing Buses</strong>
                        <p className="text-slate-400 text-[11px]">
                          Clears all current draft entries and completely replaces the timetable with this spreadsheet.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setImportStep('SELECT')}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    ← Choose Different File
                  </button>
                  <button
                    type="button"
                    onClick={handleProcessImportRows}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition active:scale-95"
                  >
                    Preview Extracted Buses →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PREVIEW & CONFIRM */}
            {importStep === 'PREVIEW' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <span>
                    Ready to import <strong className="text-emerald-400">{parsedImportRows.length} buses</strong>
                    {importMode === 'MERGE' && importDuplicatesCount > 0 && (
                      <span className="text-slate-400"> ({importDuplicatesCount} exact duplicates skipped)</span>
                    )}
                    .
                  </span>
                  {/* Mode switcher on Preview */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('MERGE')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${importMode === 'MERGE'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                    >
                      Merge Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('REPLACE')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${importMode === 'REPLACE'
                          ? 'bg-amber-950 text-amber-300 border-amber-600'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                    >
                      Replace All Mode
                    </button>
                  </div>
                </div>

                {/* 3-Row Preview Table */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden text-xs max-h-52 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold">
                      <tr>
                        <th className="p-2.5">Destination</th>
                        <th className="p-2.5">From</th>
                        <th className="p-2.5">Departure</th>
                        <th className="p-2.5">Operator</th>
                        <th className="p-2.5">Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {parsedImportRows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="p-2.5 font-bold text-white">
                            {r.destination.si} <span className="font-normal text-slate-400">({r.destination.en})</span>
                          </td>
                          <td className="p-2.5 text-slate-300">{r.origin.si}</td>
                          <td className="p-2.5 font-bold text-blue-400">{formatTime12(r.departure, 'EN')}</td>
                          <td className="p-2.5">{r.operator}</td>
                          <td className="p-2.5 text-slate-400">{formatDays(r.days)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {parsedImportRows.length > 10 && (
                  <div className="text-[11px] text-slate-500 text-center">
                    ... and {parsedImportRows.length - 10} more rows
                  </div>
                )}

                {/* Confirm Action */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setImportStep(importHeaders.length > 0 ? 'MAPPING' : 'SELECT')}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    ← {importHeaders.length > 0 ? 'Adjust Mapping' : 'Choose Different File'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importLoading}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50"
                  >
                    {importLoading ? 'Importing Buses...' : `Confirm & Save ${parsedImportRows.length} Buses (${importMode === 'REPLACE' ? 'Replace All' : 'Merge'})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 5: DELETE ALL BUSES CONFIRMATION MODAL
         =================================================================== */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsDeleteAllModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-2xl p-6 shadow-2xl space-y-4 z-10 animate-scale-in">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-white">Delete All Buses?</h3>
                <span className="text-xs text-rose-300">This action clears the draft timetable</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Delete all <strong className="text-white">{services.length} buses</strong> from the draft schedule? You can then import a clean Excel or JSON file before publishing.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleteAllLoading}
                onClick={handleDeleteAllServices}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {isDeleteAllLoading ? 'Deleting All Buses...' : 'Yes, Delete All Buses'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL 6: BULK ADD ROWS MODAL
         =================================================================== */}
      {isBulkAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsBulkAddModalOpen(false)} />
          <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 z-10 animate-scale-in max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="text-base font-bold text-white">Bulk Add Bus Rows</h3>
                  <span className="text-xs text-slate-400">
                    Add multiple bus departures at once, or copy & paste from Excel / Google Sheets
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {bulkError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs shrink-0">
                ⚠️ {bulkError}
              </div>
            )}

            {/* Quick Paste Toggle & Box */}
            <div className="shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => setShowPasteBox(!showPasteBox)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 transition"
              >
                <span>{showPasteBox ? '▼ Hide' : '▶ Show'} Quick Paste Box (from Excel / Sheets)</span>
              </button>
              {showPasteBox && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Paste columns copied from Excel or Sheets (Destination [Tab] Departure [Tab] Arrival [Tab] Origin [Tab] Operator [Tab] Type):
                  </div>
                  <textarea
                    rows={3}
                    value={bulkPasteText}
                    onChange={(e) => setBulkPasteText(e.target.value)}
                    placeholder={"Colombo\t06:30\t11:30\tMahiyanganaya\tCTB\tNORMAL\nKandy\t07:15\t\tMahiyanganaya\tPVT\tNORMAL"}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkPasteText('')}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleParsePaste}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition active:scale-95"
                    >
                      Parse & Add Rows to Grid
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Spreadsheet Table Grid */}
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-800 bg-slate-950 text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-bold sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-2.5 w-8 text-center text-slate-500">#</th>
                    <th className="p-2.5 min-w-[240px]">Destination (English / සිංහල) *</th>
                    <th className="p-2.5 w-28">Departure *</th>
                    <th className="p-2.5 w-28">Arrival</th>
                    <th className="p-2.5 min-w-[200px]">From (English / සිංහල)</th>
                    <th className="p-2.5 w-24">Operator</th>
                    <th className="p-2.5 w-28">Service</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {bulkRows.map((row, idx) => {
                    const rowVal = validateBulkRow(row, bulkContext);
                    const hasErr = !rowVal.ok;
                    return (
                      <tr
                        key={row.id}
                        className={`transition ${hasErr ? 'bg-rose-950/25 border-l-4 border-l-rose-500' : 'hover:bg-slate-900/40 focus-within:bg-slate-900/70'}`}
                      >
                        <td className="p-2 text-center text-slate-500 font-mono text-[11px] align-top pt-3">
                          {idx + 1}
                        </td>
                        <td className="p-1.5 align-top">
                          <div className="space-y-1">
                            <input
                              type="text"
                              aria-invalid={rowVal.fields.includes("destination.en")}
                              style={rowVal.fields.includes("destination.en") ? { borderColor: "#f43f5e" } : undefined}
                              value={row.destEn}
                              onChange={(e) => handleUpdateBulkRow(row.id, 'destEn', e.target.value)}
                              placeholder="English (e.g. Colombo)"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-semibold text-xs"
                            />
                            <input
                              type="text"
                              aria-invalid={rowVal.fields.includes("destination.si")}
                              style={rowVal.fields.includes("destination.si") ? { borderColor: "#f43f5e" } : undefined}
                              value={row.destSi}
                              onChange={(e) => handleUpdateBulkRow(row.id, 'destSi', e.target.value)}
                              placeholder="සිංහල (e.g. කොළඹ)"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                            />
                            {hasErr && (
                              <div className="text-[10px] text-rose-300 font-medium leading-tight">
                                ⚠️ {rowVal.errors.join(' · ')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-1.5 align-top">
                          <BulkTimePicker value={row.departure} onChange={value => handleUpdateBulkRow(row.id, 'departure', value)} invalid={rowVal.fields.includes('departure')}  />
                        </td>
                        <td className="p-1.5 align-top">
                          <BulkTimePicker value={row.arrival} onChange={value => handleUpdateBulkRow(row.id, 'arrival', value)} invalid={rowVal.fields.includes('arrival')} optional />
                        </td>
                        <td className="p-1.5 align-top">
                          <div className="space-y-1">
                            <input
                              type="text"
                              aria-invalid={rowVal.fields.includes("origin.en")}
                              style={rowVal.fields.includes("origin.en") ? { borderColor: "#f43f5e" } : undefined}
                              value={row.originEn}
                              onChange={(e) => handleUpdateBulkRow(row.id, 'originEn', e.target.value)}
                              placeholder="Origin English"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                            />
                            <input
                              type="text"
                              aria-invalid={rowVal.fields.includes("origin.si")}
                              style={rowVal.fields.includes("origin.si") ? { borderColor: "#f43f5e" } : undefined}
                              value={row.originSi}
                              onChange={(e) => handleUpdateBulkRow(row.id, 'originSi', e.target.value)}
                              placeholder="ආරම්භක සිංහල"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                            />
                          </div>
                        </td>
                        <td className="p-1.5 align-top">
                          <select
                            value={row.operator}
                            onChange={(e) => handleUpdateBulkRow(row.id, 'operator', e.target.value as 'PVT' | 'CTB')}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold focus:outline-none focus:border-indigo-500 text-xs"
                          >
                            <option value="PVT">PVT</option>
                            <option value="CTB">CTB (SLTB)</option>
                          </select>
                        </td>
                        <td className="p-1.5 align-top">
                          <select
                            value={row.serviceType}
                            onChange={(e) => handleUpdateBulkRow(row.id, 'serviceType', e.target.value as any)}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-semibold focus:outline-none focus:border-indigo-500 text-[11px]"
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="SEMI_LUXURY">Semi-Luxury</option>
                            <option value="LUXURY">Luxury</option>
                            <option value="EXPRESS">Express</option>
                          </select>
                        </td>
                        <td className="p-1.5 text-center align-top pt-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveBulkRow(row.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 text-xs"
                            title="Remove row"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Bottom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 shrink-0 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddBulkRow}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>+</span>
                  <span>Add Row</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkRows([createEmptyBulkRow(), createEmptyBulkRow(), createEmptyBulkRow()])}
                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition"
                >
                  Reset Grid
                </button>
                <span className="text-xs text-slate-500">
                  {bulkRows.filter(r => (r.destEn.trim() || r.destSi.trim()) && r.departure.trim()).length} of {bulkRows.length} rows ready
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBulkRows}
                  disabled={
                    bulkSaveLoading ||
                    bulkRows.filter(r => (r.destEn.trim() || r.destSi.trim()) && r.departure.trim()).length === 0 ||
                    bulkRows.some(r => !validateBulkRow(r, bulkContext).ok)
                  }
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
                >
                  {bulkSaveLoading
                    ? 'Saving Rows...'
                    : `Save All ${bulkRows.filter(r => (r.destEn.trim() || r.destSi.trim()) && r.departure.trim()).length} Rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
