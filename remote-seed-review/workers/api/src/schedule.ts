import {
  validateScheduleDocument,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  minutes,
  timeDistance,
  colomboDate,
  type ScheduleDocument,
  type FieldIssue,
  type BusService,
} from '@bus-schedule/shared';
export const sortServices = (services: readonly BusService[]): BusService[] =>
  [...services].sort(
    (a, b) =>
      a.departure.localeCompare(b.departure) ||
      a.destination.en.localeCompare(b.destination.en, 'en') ||
      a.id.localeCompare(b.id),
  );
export function validateDocument(document: ScheduleDocument, now = new Date()) {
  const shape = validateScheduleDocument(document);
  const issues = document.services.map((service) => ({
    serviceId: service.id,
    ...validateServiceStrict(service, document),
  }));
  const errors: (FieldIssue & { serviceId?: string })[] = [
    ...issues.flatMap((row) => row.errors.map((error) => ({ ...error, serviceId: row.serviceId }))),
    ...validateAlertStrict(document.alert, now),
    ...validateLastVerified(document.lastVerified, now),
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
const label = (s: BusService) => `${s.origin.en} → ${s.destination.en} ${s.departure}`;
export function scheduleDiff(live: ScheduleDocument | null, draft: ScheduleDocument) {
  const before = new Map(live?.services.map((s) => [s.id, s]) ?? []);
  const after = new Map(draft.services.map((s) => [s.id, s]));
  const changed = draft.services.flatMap((s) => {
    const old = before.get(s.id);
    if (!old) return [];
    const fields = (Object.keys(s) as (keyof BusService)[])
      .filter((field) => !equal(old[field], s[field]))
      .map((field) => ({ field, before: old[field], after: s[field] }));
    return fields.length ? [{ id: s.id, label: label(s), fields }] : [];
  });
  return {
    added: draft.services
      .filter((s) => !before.has(s.id))
      .map((s) => ({ id: s.id, label: label(s) })),
    removed: (live?.services ?? [])
      .filter((s) => !after.has(s.id))
      .map((s) => ({ id: s.id, label: label(s) })),
    changed,
    alertChanged: !equal(live?.alert ?? null, draft.alert),
    displayChanged: !equal(live?.display, draft.display),
    lastVerifiedChanged: live?.lastVerified !== draft.lastVerified,
    stationChanged: !equal(live?.station, draft.station),
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
): PublishWarning[] {
  const warnings: PublishWarning[] = validateDocument(document, now).issues.flatMap((row) =>
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
  if (live && document.services.length < live.services.length * 0.7)
    add(
      'COUNT_DROPPED',
      'Service count dropped by more than 30%.',
      'බස් සේවා ගණන සියයට 30 කට වඩා අඩු වී ඇත.',
    );
  if (!document.services.some((s) => s.active))
    add('NO_ACTIVE_SERVICES', 'There are zero active services.', 'සක්‍රිය බස් සේවා කිසිවක් නැත.');
  if (Date.parse(colomboDate(now)) - Date.parse(document.lastVerified) > 14 * 86400000)
    add(
      'VERIFICATION_OLD',
      'The timetable was last verified over 14 days ago.',
      'කාලසටහන අවසන් වරට තහවුරු කර දින 14 කට වැඩිය.',
    );
  if (
    document.alert?.enabled &&
    document.alert.expiresAt &&
    Date.parse(document.alert.expiresAt) <= now.getTime()
  )
    add('ALERT_EXPIRED', 'The enabled alert has expired.', 'සක්‍රිය නිවේදනයේ කාලය අවසන් වී ඇත.');
  for (let i = 0; i < document.services.length; i++) {
    const s = document.services[i]!;
    if (!s.active) continue;
    for (const other of document.services.slice(i + 1)) {
      if (
        other.active &&
        s.destination.en.toLowerCase() === other.destination.en.toLowerCase() &&
        s.origin.en.toLowerCase() === other.origin.en.toLowerCase() &&
        timeDistance(s.departure, other.departure) <= 5 &&
        s.days.some((d) => other.days.includes(d))
      )
        add(
          'NEAR_DUPLICATE',
          `Near-duplicate with ${other.id}.`,
          `ඉතා සමාන වෙනත් සේවාවක් ඇත: ${other.id}.`,
          s.id,
        );
    }
  }
  for (let day = 1; day <= 7; day++)
    for (let hour = 0; hour < 24; hour++) {
      const count = document.services.filter(
        (s) =>
          s.active &&
          s.days.some((d) => d === day) &&
          Math.floor(minutes(s.departure) / 60) === hour,
      ).length;
      if (count > 20)
        add(
          'BUSY_HOUR',
          `${count} departures on weekday ${day} during hour ${hour}.`,
          `සතියේ ${day} දින ${hour} පැය තුළ බස් පිටත්වීම් ${count} ක් ඇත.`,
        );
    }
  return warnings;
}
