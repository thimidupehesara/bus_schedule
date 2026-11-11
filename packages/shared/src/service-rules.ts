import {
  AlertBannerSchema,
  BusServiceSchema,
  type BusService,
  type ScheduleDocument,
} from './schema.js';
import { KNOWN_PLACES, findClosestKnownPlace } from './known-places.js';

export type FieldIssue = { field: string; code: string; message_en: string; message_si: string };
export type ServiceContext = {
  station: ScheduleDocument['station'];
  services: readonly BusService[];
};
export const issue = (
  field: string,
  code: string,
  message_en: string,
  message_si: string,
): FieldIssue => ({ field, code, message_en, message_si });
export const minutes = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const timeDistance = (a: string, b: string): number => {
  const gap = Math.abs(minutes(a) - minutes(b));
  return Math.min(gap, 1440 - gap);
};
export const colomboDate = (now = new Date()): string =>
  new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);

/** Only unambiguous numeric time forms are converted; invalid values remain invalid. */
export function normalizeServiceInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const value: Record<string, unknown> = { ...raw };
  for (const field of ['departure', 'arrival', 'tripStart', 'destinationArrival']) {
    const time = value[field];
    if (typeof time !== 'string') continue;
    const digits = time.replace(/[\u0DE6-\u0DEF\u0660-\u0669\u06F0-\u06F9]/g, (c) => {
      const n = c.charCodeAt(0);
      return String(n - (n >= 0x0de6 ? 0x0de6 : n >= 0x06f0 ? 0x06f0 : 0x0660));
    });
    const match = /^(\d{1,2})[:.](\d{2})$/.exec(digits) ?? /^(\d{2})(\d{2})$/.exec(digits);
    if (match && Number(match[1]) <= 23 && Number(match[2]) <= 59)
      value[field] = `${match[1]!.padStart(2, '0')}:${match[2]}`;
  }
  return value;
}

export function validateServiceStrict(
  raw: unknown,
  context: ServiceContext,
): { errors: FieldIssue[]; warnings: FieldIssue[] } {
  const errors: FieldIssue[] = [],
    warnings: FieldIssue[] = [];
  if (
    raw &&
    typeof raw === 'object' &&
    'days' in raw &&
    Array.isArray(raw.days) &&
    raw.days.length > 7
  ) {
    return {
      errors: [
        issue(
          'days',
          'TOO_MANY_DAYS',
          'Use at most seven unique weekdays.',
          'සතියේ වෙනස් දින හතක් දක්වා පමණක් ඇතුළත් කරන්න.',
        ),
      ],
      warnings,
    };
  }
  const parsed = BusServiceSchema.strict().safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((e) =>
        issue(
          e.path.join('.'),
          'INVALID_VALUE',
          e.message,
          'අගය වලංගු නොවේ. වේලාව පැය 24 ක්‍රමයට HH:mm ලෙසත් අවශ්‍ය සියලු විස්තර නිවැරදිවත් ඇතුළත් කරන්න.',
        ),
      ),
      warnings,
    };
  }
  const s = parsed.data;
  for (const field of ['destination', 'origin', 'via'] as const) {
    const place = s[field];
    if (!place) continue;
    for (const language of ['si', 'en'] as const) {
      const text = place[language];
      if (text.trim() !== text || /\s{2}|[^\S ]/.test(text)) {
        errors.push(
          issue(
            `${field}.${language}`,
            'SPACING',
            'Remove leading, trailing or repeated spaces.',
            'මුල, අග සහ නැවත නැවත ඇති හිස්තැන් ඉවත් කරන්න.',
          ),
        );
      }
      if (
        language === 'si'
          ? !/[\u0D80-\u0DFF]/.test(text) || /\p{Script=Latin}/u.test(text)
          : !/^[A-Za-z .'-]+$/.test(text)
      ) {
        errors.push(
          issue(
            `${field}.${language}`,
            'SCRIPT',
            language === 'si'
              ? 'Use Sinhala without Latin letters.'
              : 'Use Latin letters, spaces, period, hyphen or apostrophe only.',
            'සිංහල නමට සිංහල අකුරුද ඉංග්‍රීසි නමට ඉංග්‍රීසි අකුරුද පමණක් භාවිත කරන්න.',
          ),
        );
      }
    }
    if (
      field !== 'via' &&
      !KNOWN_PLACES.some((p) => p.en.toLowerCase() === place.en.toLowerCase() && p.si === place.si)
    ) {
      const closest = findClosestKnownPlace(place.en);
      warnings.push(
        issue(
          field,
          'UNKNOWN_PLACE',
          `Check spelling. Closest known place: ${closest.en} (${closest.si}).`,
          `නමේ අක්ෂර වින්‍යාසය පරීක්ෂා කරන්න. ආසන්න නම: ${closest.si} (${closest.en}).`,
        ),
      );
    }
  }
  const same = (a: { en: string; si: string }, b: { en: string; si: string }) =>
    a.en.toLowerCase() === b.en.toLowerCase() || a.si === b.si;
  if (same(s.origin, s.destination))
    errors.push(
      issue(
        'origin',
        'SAME_PLACE',
        'Origin and destination must differ.',
        'ආරම්භක ස්ථානය සහ ගමනාන්තය වෙනස් විය යුතුය.',
      ),
    );
  for (const field of ['origin', 'destination'] as const) {
    if (same(s[field], context.station.name))
      errors.push(
        issue(
          field,
          'STATION_NAME',
          'Place must differ from the station name.',
          'ස්ථානයේ නම බස් නැවතුමේ නමට වෙනස් විය යුතුය.',
        ),
      );
  }
  if (new Set(s.days).size !== s.days.length)
    errors.push(
      issue(
        'days',
        'DUPLICATE_DAY',
        'Weekdays must be unique.',
        'සතියේ එකම දිනය නැවත ඇතුළත් නොකරන්න.',
      ),
    );
  if (s.bay !== null && !/^[A-Za-z0-9-]{1,4}$/.test(s.bay))
    errors.push(
      issue(
        'bay',
        'INVALID_BAY',
        'Bay must be 1–4 letters, digits or hyphens.',
        'වේදිකා අංකයට අකුරු, ඉලක්කම් හෝ කෙටි ඉර පමණක් යොදන්න (අක්ෂර 1–4).',
      ),
    );
  if (s.arrival !== null) {
    const gap = (minutes(s.departure) - minutes(s.arrival) + 1440) % 1440;
    if (gap > 180)
      errors.push(
        issue(
          'arrival',
          'WAIT_TOO_LONG',
          'Arrival to departure exceeds 180 minutes.',
          'පැමිණීම සහ පිටත්වීම අතර කාලය විනාඩි 180 ඉක්මවයි.',
        ),
      );
    else if (gap >= 90)
      warnings.push(
        issue(
          'arrival',
          'LONG_WAIT',
          'Check the 90–180 minute wait.',
          'විනාඩි 90–180 අතර රැඳී සිටීමේ කාලය පරීක්ෂා කරන්න.',
        ),
      );
  }
  if (minutes(s.departure) < 240)
    warnings.push(
      issue(
        'departure',
        'OVERNIGHT',
        'Confirm the overnight departure and its departure weekday.',
        'මධ්‍යම රාත්‍රියෙන් පසු පිටත්වන වේලාව සහ පිටත්වන දිනය තහවුරු කරන්න.',
      ),
    );
  if (s.tripStart && s.tripStart > s.departure)
    warnings.push(
      issue(
        'tripStart',
        'TRIP_START_AFTER',
        'Trip start is after departure; check midnight wrapping.',
        'ගමන ආරම්භවන වේලාව පිටත්වීමට පසුය; මධ්‍යම රාත්‍රිය පසු කිරීම පරීක්ෂා කරන්න.',
      ),
    );
  for (const other of context.services) {
    if (other.id === s.id) continue;
    const route =
      other.destination.en.toLowerCase() === s.destination.en.toLowerCase() &&
      other.origin.en.toLowerCase() === s.origin.en.toLowerCase();
    const overlaps = s.days.some((d) => other.days.includes(d));
    if (route && other.departure === s.departure && overlaps)
      errors.push(
        issue(
          'departure',
          'DUPLICATE_SERVICE',
          `Duplicates service ${other.id}.`,
          `මෙම බස් සේවාව දැනටමත් ඇත: ${other.id}.`,
        ),
      );
    if (
      route &&
      timeDistance(other.departure, s.departure) <= 30 &&
      s.days.length < 7 &&
      other.days.some((d) => !s.days.includes(d))
    )
      warnings.push(
        issue(
          'days',
          'SIMILAR_OTHER_DAYS',
          `Similar service on other days: ${other.id}.`,
          `වෙනත් දිනවල සමාන බස් සේවාවක් ඇත: ${other.id}.`,
        ),
      );
    // Check actual departure weekdays, including collisions across midnight.
    const bayOverlap = s.days.some((d) =>
      other.days.some((e) => {
        const gap = Math.abs((d - e) * 1440 + minutes(s.departure) - minutes(other.departure));
        return Math.min(gap, 10080 - gap) <= 5;
      }),
    );
    if (s.bay && s.bay.toLowerCase() === other.bay?.toLowerCase() && bayOverlap)
      warnings.push(
        issue(
          'bay',
          'BAY_COLLISION',
          `Bay used within five minutes by ${other.id}.`,
          `විනාඩි පහක් ඇතුළත එම වේදිකාව භාවිත කරන වෙනත් බසයක් ඇත: ${other.id}.`,
        ),
      );
  }
  return { errors, warnings };
}

export function validateAlertStrict(raw: unknown, now = new Date()): FieldIssue[] {
  if (raw === null) return [];
  const result = AlertBannerSchema.strict().safeParse(raw);
  if (!result.success)
    return result.error.issues.map((e) =>
      issue(
        `alert.${e.path.join('.')}`,
        'INVALID_ALERT',
        e.message,
        'නිවේදනයේ අගය නිවැරදි කරන්න (අක්ෂර 140 දක්වා).',
      ),
    );
  const alert = result.data;
  const errors: FieldIssue[] = [];
  if (alert.enabled) {
    for (const language of ['si', 'en'] as const)
      if (!alert.text[language].trim())
        errors.push(
          issue(
            `alert.text.${language}`,
            'ALERT_TEXT_REQUIRED',
            'Enabled alerts require Sinhala and English text (1–140 characters).',
            'සක්‍රිය නිවේදනයට සිංහල සහ ඉංග්‍රීසි පාඨ දෙකම අවශ්‍යය (අක්ෂර 1–140).',
          ),
        );
    if (alert.expiresAt !== null && Date.parse(alert.expiresAt) <= now.getTime())
      errors.push(
        issue(
          'alert.expiresAt',
          'ALERT_EXPIRED',
          'Enabled alert expiry must be in the future.',
          'සක්‍රිය නිවේදනය අවසන් වන වේලාව අනාගත වේලාවක් විය යුතුය.',
        ),
      );
  }
  return errors;
}

export function validateLastVerified(raw: unknown, now = new Date()): FieldIssue[] {
  if (
    typeof raw !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    !Number.isFinite(Date.parse(raw)) ||
    new Date(raw).toISOString().slice(0, 10) !== raw ||
    raw > colomboDate(now)
  ) {
    return [
      issue(
        'lastVerified',
        'INVALID_VERIFIED_DATE',
        'Use a real YYYY-MM-DD date, no later than today in Asia/Colombo.',
        'Asia/Colombo අද දිනයට පසු නොවන සැබෑ දිනයක් YYYY-MM-DD ලෙස ඇතුළත් කරන්න.',
      ),
    ];
  }
  return [];
}
