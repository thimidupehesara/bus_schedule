import {
  validateScheduleDocument,
  BusServiceSchema,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  minutes,
  timeDistance,
  colomboDate,
  toWeekdayNumber,
  type ScheduleDocument,
  type FieldIssue,
  type BusService,
  type DisplaySettings,
} from '@bus-schedule/shared';
export const sortServices = (services: readonly BusService[]): BusService[] =>
  [...services].sort(
    (a, b) =>
      String(a?.departure ?? '').localeCompare(String(b?.departure ?? '')) ||
      String(a?.destination?.en ?? '').localeCompare(String(b?.destination?.en ?? ''), 'en') ||
      String(a?.id ?? '').localeCompare(String(b?.id ?? '')),
  );
export function validateDocument(document: ScheduleDocument, now = new Date()) {
  const shape = validateScheduleDocument(document);
  const services = Array.isArray(document?.services) ? document.services : [];
  const validServices = shape.ok ? shape.data.services : services.filter(service => BusServiceSchema.safeParse(service).success);
  const routes = new Map<string, BusService[]>();
  const bays = new Map<string, BusService[]>();
  const routeKey = (service: BusService) => JSON.stringify([service.origin.en.toLowerCase(), service.destination.en.toLowerCase()]);
  for (const service of validServices) {
    const key = routeKey(service);
    const route = routes.get(key) ?? [];
    route.push(service); routes.set(key, route);
    if (service.bay) {
      const key = service.bay.toLowerCase();
      const bay = bays.get(key) ?? [];
      bay.push(service); bays.set(key, bay);
    }
  }
  const issues = services.map((service) => {
    const route = typeof service?.origin?.en === 'string' && typeof service?.destination?.en === 'string' ? routes.get(routeKey(service)) ?? [] : [];
    const bay = typeof service?.bay === 'string' ? bays.get(service.bay.toLowerCase()) ?? [] : [];
    return { serviceId: service?.id, ...validateServiceStrict(service, { ...document, services: [...new Set([...route, ...bay])] }) };
  });
  const errors: (FieldIssue & { serviceId?: string })[] = [
    ...issues.flatMap((row) => row.errors.map((error) => ({ ...error, serviceId: row.serviceId }))),
    ...validateAlertStrict(document?.alert ?? null, now),
    ...validateLastVerified(document?.lastVerified, now),
    ...(!shape.ok
      ? shape.errors.map((message) => ({
          field: 'document',
          code: 'SCHEMA',
          message_en: message,
          message_si: 'කාලසටහනේ දත්ත ආකෘතිය නිවැරදි කරන්න.',
        }))
      : []),
  ];
  return { validation: { ok: errors.length === 0, errors }, issues };
}
export async function makeEtag(version: number, body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
  return `"v${version}-${hex.slice(0, 16)}"`;
}
export function matchesEtag(header: string | null, etag: string): boolean {
  return (
    header !== null &&
    header
      .split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)
  );
}
export const nextVersion = (maximum: number): number => maximum + 1;
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    return (
      Object.keys(x).length === Object.keys(y).length &&
      Object.keys(x).every((k) => equal(x[k], y[k]))
    );
  }
  return false;
};
const label = (s: BusService) =>
  `${s?.origin?.en ?? 'Mahiyanganaya'} → ${s?.destination?.en ?? 'Unknown'} ${s?.departure ?? '--:--'}`;
export function normalizeDisplaySettings(
  display?: Partial<DisplaySettings> | null,
): { departedGraceMinutes: number; soonThresholdMinutes: number; lookaheadHours: number } | null {
  if (!display) return null;
  return {
    departedGraceMinutes: display.departedGraceMinutes ?? 15,
    soonThresholdMinutes: display.soonThresholdMinutes ?? 15,
    lookaheadHours: display.lookaheadHours ?? 8,
  };
}
export function scheduleDiff(live: ScheduleDocument | null, draft: ScheduleDocument) {
  const before = new Map(live?.services?.map((s) => [s?.id, s]) ?? []);
  const after = new Map(draft?.services?.map((s) => [s?.id, s]) ?? []);
  const changed = (draft?.services ?? []).flatMap((s) => {
    if (!s || !s.id) return [];
    const old = before.get(s.id);
    if (!old) return [];
    const fields = (Object.keys(s) as (keyof BusService)[])
      .filter((field) => !equal(old[field], s[field]))
      .map((field) => ({ field, before: old[field], after: s[field] }));
    return fields.length ? [{ id: s.id, label: label(s), fields }] : [];
  });
  return {
    added: (draft?.services ?? [])
      .filter((s) => s && s.id && !before.has(s.id))
      .map((s) => ({ id: s.id, label: label(s) })),
    removed: (live?.services ?? [])
      .filter((s) => s && s.id && !after.has(s.id))
      .map((s) => ({ id: s.id, label: label(s) })),
    changed,
    alertChanged: !equal(live?.alert ?? null, draft?.alert ?? null),
    displayChanged: !equal(
      normalizeDisplaySettings(live?.display),
      normalizeDisplaySettings(draft?.display),
    ),
    lastVerifiedChanged: live?.lastVerified !== draft?.lastVerified,
    stationChanged: !equal(live?.station, draft?.station),
  };
}
export function hasChanges(live: ScheduleDocument | null, draft: ScheduleDocument): boolean {
  const d = scheduleDiff(live, draft);
  return (
    !live ||
    !!(
      d.added.length ||
      d.removed.length ||
      d.changed.length ||
      d.alertChanged ||
      d.displayChanged ||
      d.lastVerifiedChanged ||
      d.stationChanged
    )
  );
}
export type PublishWarning = {
  code: string;
  severity: 'warning';
  message_en: string;
  message_si: string;
  serviceId?: string;
  field?: string;
};
export function publishWarnings(
  document: ScheduleDocument,
  live: ScheduleDocument | null,
  now = new Date(),
  validated = validateDocument(document, now),
): PublishWarning[] {
  const services = Array.isArray(document?.services) ? document.services : [];
  const warnings: PublishWarning[] = validated.issues.flatMap((row) =>
    row.warnings.map((w) => ({ ...w, severity: 'warning' as const, serviceId: row.serviceId })),
  );
  const add = (code: string, message_en: string, message_si: string, serviceId?: string) =>
    warnings.push({
      code,
      severity: 'warning',
      message_en,
      message_si,
      ...(serviceId ? { serviceId } : {}),
    });
  if (live && Array.isArray(live.services) && services.length < live.services.length * 0.7)
    add(
      'COUNT_DROPPED',
      'Service count dropped by more than 30%.',
      'බස් සේවා ගණන සියයට 30 කට වඩා අඩු වී ඇත.',
    );
  if (!services.some((s) => s?.active))
    add('NO_ACTIVE_SERVICES', 'There are zero active services.', 'සක්‍රිය බස් සේවා කිසිවක් නැත.');
  if (document?.lastVerified && Date.parse(colomboDate(now)) - Date.parse(document.lastVerified) > 14 * 86400000)
    add(
      'VERIFICATION_OLD',
      'The timetable was last verified over 14 days ago.',
      'කාලසටහන අවසන් වරට තහවුරු කර දින 14 කට වැඩිය.',
    );
  if (
    document?.alert?.enabled &&
    document.alert.expiresAt &&
    Date.parse(document.alert.expiresAt) <= now.getTime()
  )
    add('ALERT_EXPIRED', 'The enabled alert has expired.', 'සක්‍රිය නිවේදනයේ කාලය අවසන් වී ඇත.');
  for (let i = 0; i < services.length; i++) {
    const s = services[i]!;
    if (!s?.active) continue;
    const sDest = typeof s.destination?.en === 'string' ? s.destination.en.toLowerCase() : '';
    const sOrig = typeof s.origin?.en === 'string' ? s.origin.en.toLowerCase() : '';
    for (const other of services.slice(i + 1)) {
      if (
        other?.active &&
        sDest &&
        sDest === String(other.destination?.en ?? '').toLowerCase() &&
        sOrig &&
        sOrig === String(other.origin?.en ?? '').toLowerCase() &&
        typeof s.departure === 'string' &&
        typeof other.departure === 'string' &&
        timeDistance(s.departure, other.departure) <= 5 &&
        Array.isArray(s.days) &&
        Array.isArray(other.days) &&
        s.days.some((d) => other.days.some((e) => toWeekdayNumber(d) === toWeekdayNumber(e)))
      )
        add(
          'NEAR_DUPLICATE',
          `Near-duplicate with ${other.id}.`,
          `ඉතා සමාන වෙනත් සේවාවක් ඇත: ${other.id}.`,
          s.id,
        );
    }
  }
  const counts = new Map<number, number>();
  for (const service of services) {
    if (!service?.active || !Array.isArray(service.days) || typeof service.departure !== 'string' || !/^\d{2}:\d{2}$/.test(service.departure)) continue;
    const hour = Math.floor(minutes(service.departure) / 60);
    for (const day of new Set(service.days.map(toWeekdayNumber))) {
      const key = day * 24 + hour;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of [...counts].sort(([a], [b]) => a - b)) {
    if (count <= 20) continue;
    const day = Math.floor(key / 24), hour = key % 24;
    add('BUSY_HOUR', `${count} departures on weekday ${day} during hour ${hour}.`, `සතියේ ${day} දින ${hour} පැය තුළ බස් පිටත්වීම් ${count} ක් ඇත.`);
  }
  return warnings;
}
