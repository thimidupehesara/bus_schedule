import { KNOWN_PLACES, type BusService, type Weekday } from '@bus-schedule/shared';

export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
export function normalizeTime(value: string, meridiem = ''): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i.exec(raw) ?? /^(\d{2})(\d{2})$/.exec(raw);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (meridiem.trim() || match[3] || '').toUpperCase();
  if (suffix && !['AM', 'PM', 'පෙ.ව.', 'ප.ව.'].includes(suffix)) return null;
  if (suffix && (hour < 1 || hour > 12)) return null;
  if (suffix) hour = hour % 12 + (suffix === 'PM' || suffix === 'ප.ව.' ? 12 : 0);
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : null;
}
export function resolveTownPair(raw: string, defaultEn = '', defaultSi = '') {
  const value = raw.trim();
  if (!value) return { en: defaultEn, si: defaultSi };
  const exact = KNOWN_PLACES.find(p => p.en.toLowerCase() === value.toLowerCase() || p.si === value);
  if (exact) return { en: exact.en, si: exact.si };
  return /[\u0D80-\u0DFF]/.test(value) ? { si: value, en: '' } : { en: value, si: '' };
}
export function placePair(si: unknown, en: unknown) {
  const suppliedSi = text(si), suppliedEn = text(en);
  const known = resolveTownPair(suppliedEn || suppliedSi);
  return { si: suppliedSi || known.si, en: suppliedEn || known.en };
}
export const columnLabels = {
  destSi: 'ගමනාන්තය (Sinhala)', destEn: 'Destination (English)',
  originSi: 'ගමනාරම්භය (Sinhala)', originEn: 'Origin (English)',
  dep: 'Departure time', depPeriod: 'Departure AM/PM', arr: 'Arrival time', arrPeriod: 'Arrival AM/PM',
  operator: 'CTB/PVT', serviceType: 'Service Type (English)', days: 'Days', active: 'Active / Status',
};
export type ColumnMapping = Record<keyof typeof columnLabels, number>;
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping = Object.fromEntries(Object.keys(columnLabels).map(key => [key, -1])) as ColumnMapping;
  let lastTime: 'dep' | 'arr' | null = null;
  headers.forEach((header, index) => {
    const h = header.trim().toLowerCase();
    const english = /english|\(en\)|[_ ]en$/.test(h);
    const sinhala = /sinhala|\(si\)|[_ ]si$|[\u0D80-\u0DFF]/.test(h);
    if (/am\s*[/.-]?\s*pm|meridiem/.test(h)) {
      const kind = /arr/.test(h) ? 'arr' : /dep/.test(h) ? 'dep' : lastTime;
      if (kind) mapping[kind === 'dep' ? 'depPeriod' : 'arrPeriod'] = index;
    } else if (/destination|^dest|ගමනාන්ත/.test(h)) mapping[sinhala && !english ? 'destSi' : 'destEn'] = index;
    else if (/origin|^from|ගමනාරම්භ|ආරම්භ/.test(h)) mapping[sinhala && !english ? 'originSi' : 'originEn'] = index;
    else if (/departure|^dep$|පිටත්/.test(h)) { mapping.dep = index; lastTime = 'dep'; }
    else if (/arrival|^arr$|පැමිණ/.test(h)) { mapping.arr = index; lastTime = 'arr'; }
    else if (/operator|ctb|pvt|sltb/.test(h)) mapping.operator = index;
    else if (/service|type|වර්ගය/.test(h) && (mapping.serviceType < 0 || english)) mapping.serviceType = index;
    else if (/days|frequency|දින/.test(h)) mapping.days = index;
    else if (/active|status|සක්‍රිය/.test(h)) mapping.active = index;
  });
  return mapping;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export const ALL_DAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const WEEKDAYS_LIST: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
export const WEEKENDS_LIST: Weekday[] = ['SAT', 'SUN'];

export function parseDaysField(value: unknown): Weekday[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [...ALL_DAYS];
    const parsed = value
      .map((v) => {
        if (typeof v === 'number' && v >= 1 && v <= 7) return ALL_DAYS[v - 1]!;
        const s = String(v).trim().toUpperCase();
        if (ALL_DAYS.includes(s as Weekday)) return s as Weekday;
        return null;
      })
      .filter((v): v is Weekday => v !== null);
    return parsed.length > 0 ? parsed : [...ALL_DAYS];
  }

  const raw = text(value).trim().toLowerCase();
  if (
    !raw ||
    /^(every\s*day|daily|all|all\s*days|සෑම\s*දිනකම)$/i.test(raw) ||
    /every\s*day|daily|සෑම\s*දිනකම/i.test(raw)
  ) {
    return [...ALL_DAYS];
  }
  if (/^weekdays?$/i.test(raw) || /weekday|සතියේ\s*දින/i.test(raw)) {
    return [...WEEKDAYS_LIST];
  }
  if (/^weekends?$/i.test(raw) || /weekend|සති\s*අන්ත/i.test(raw)) {
    return [...WEEKENDS_LIST];
  }

  const tokens = raw.split(/[,;\s/]+/).map((t) => t.trim().toUpperCase());
  const map: Record<string, Weekday> = {
    '1': 'MON', 'MON': 'MON', 'MONDAY': 'MON', 'සඳුදා': 'MON',
    '2': 'TUE', 'TUE': 'TUE', 'TUESDAY': 'TUE', 'අඟහරුවාදා': 'TUE',
    '3': 'WED', 'WED': 'WED', 'WEDNESDAY': 'WED', 'බදාදා': 'WED',
    '4': 'THU', 'THU': 'THU', 'THURSDAY': 'THU', 'බ්‍රහස්පතින්දා': 'THU',
    '5': 'FRI', 'FRI': 'FRI', 'FRIDAY': 'FRI', 'සිකුරාදා': 'FRI',
    '6': 'SAT', 'SAT': 'SAT', 'SATURDAY': 'SAT', 'සෙනසුරාදා': 'SAT',
    '7': 'SUN', 'SUN': 'SUN', 'SUNDAY': 'SUN', 'ඉරිදා': 'SUN',
  };
  const matched: Weekday[] = [];
  for (const token of tokens) {
    const code = map[token];
    if (code && !matched.includes(code)) {
      matched.push(code);
    }
  }

  return matched.length > 0 ? matched : [...ALL_DAYS];
}

export function parseService(value: unknown, row: number): BusService {
  const s = record(value), dest = record(s['destination']), orig = record(s['origin']);
  const departureRaw = text(s['departure'] ?? s['departureTime']);
  const departure = normalizeTime(departureRaw, text(s['departurePeriod']));
  if (!departure) throw new Error(`Row ${row}: invalid or missing departure "${departureRaw}". Use HH:mm with AM/PM when needed.`);
  const arrivalRaw = text(s['arrival'] ?? s['arrivalTime']);
  const arrival = arrivalRaw ? normalizeTime(arrivalRaw, text(s['arrivalPeriod'])) : null;
  if (arrivalRaw && !arrival) throw new Error(`Row ${row}: invalid arrival "${arrivalRaw}".`);
  const destination = placePair(dest['si'] ?? s['destination_si'] ?? s['dest_si'] ?? s['destSi'], dest['en'] ?? s['destination_en'] ?? s['dest_en'] ?? s['destEn'] ?? text(s['destination']));
  const originSi = orig['si'] ?? s['origin_si'] ?? s['originSi'];
  const originEn = orig['en'] ?? s['origin_en'] ?? s['originEn'] ?? text(s['origin']);
  const origin = text(originSi) || text(originEn) ? placePair(originSi, originEn) : { si: 'මහියංගනය', en: 'Mahiyanganaya' };
  const type = text(s['serviceType'] ?? s['service_type']);
  const days = parseDaysField(s['days'] ?? s['daysOfWeek'] ?? s['days_of_week'] ?? s['frequency']);

  // Active status: ALWAYS default to true unless explicitly false / inactive
  let active = true;
  const rawActive = s['active'] ?? s['status'];
  if (rawActive !== undefined && rawActive !== null && rawActive !== '') {
    if (typeof rawActive === 'boolean') {
      active = rawActive;
    } else {
      const activeText = text(rawActive).toLowerCase();
      if (['false', '0', 'no', 'inactive', 'අක්‍රිය', 'n', 'off', 'hide', 'hidden'].includes(activeText)) {
        active = false;
      } else {
        active = true;
      }
    }
  }

  return {
    id: crypto.randomUUID(), destination, origin, departure, arrival,
    via: s['via'] == null ? null : placePair(record(s['via'])['si'], record(s['via'])['en'] ?? text(s['via'])),
    tripStart: s['tripStart'] == null ? null : text(s['tripStart']), destinationArrival: s['destinationArrival'] == null ? null : text(s['destinationArrival']),
    operator: /CTB|SLTB|ලංගම/i.test(text(s['operator'])) ? 'CTB' : 'PVT',
    serviceType: /express/i.test(type) ? 'EXPRESS' : /semi/i.test(type) ? 'SEMI_LUXURY' : /lux/i.test(type) ? 'LUXURY' : 'NORMAL',
    days, bay: s['bay'] == null ? null : text(s['bay']), active,
  };
}
export function parseJsonServices(value: unknown): BusService[] {
  const obj = record(value);
  const entries = Array.isArray(value) ? value : obj['services'] ?? record(obj['document'])['services'] ?? obj['timetable'];
  if (!Array.isArray(entries) || !entries.length) throw new Error('JSON must contain a non-empty services array or a flat array of bus records.');
  return entries.map((entry, i) => parseService(entry, i + 1));
}
export function parseSpreadsheet(rows: string[][], mapping: ColumnMapping): BusService[] {
  if (mapping.dep < 0 || (mapping.destSi < 0 && mapping.destEn < 0)) throw new Error('Map Destination and Departure columns first.');
  const services = rows.flatMap((row, i) => {
    if (!row.some(cell => text(cell))) return [];
    const get = (key: keyof ColumnMapping) => text(row[mapping[key]]);
    return [parseService({
      destination: { si: get('destSi'), en: get('destEn') },
      origin: { si: get('originSi'), en: get('originEn') },
      departure: get('dep'),
      departurePeriod: get('depPeriod'),
      arrival: get('arr'),
      arrivalPeriod: get('arrPeriod'),
      operator: get('operator'),
      serviceType: get('serviceType'),
      days: get('days'),
      active: mapping.active >= 0 ? get('active') : undefined,
    }, i + 2)];
  });
  if (!services.length) throw new Error('No bus records found.');
  return services;
}
