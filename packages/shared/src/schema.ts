/**
 * @file schema.ts
 * Single source of truth for all shared types and Zod validators.
 *
 * CONTRACT RULES:
 * - All times are Asia/Colombo wall-clock time, NEVER UTC.
 * - Times after midnight (e.g. 00:30) are valid and belong to the NEXT calendar
 *   day relative to an evening reader. The TV app sorts by "next occurrence from
 *   now", wrapping past midnight. `days` refers to the weekday on which the bus
 *   DEPARTS from the stand.
 * - `schemaVersion` must be the literal number 1. Bump the identifier (not the
 *   constant) when a breaking change is needed.
 * - `services` is capped at 300 entries.
 * - Duplicate service `id` values must fail validation.
 * - `mobileUrl` must use the https scheme.
 * - All LocalizedText fields require both `si` (Sinhala) and `en` (English),
 *   each 1–80 characters.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

/** Regex that validates HH:mm in 24-hour format (00:00–23:59). */
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** HH:mm 24-hour wall-clock time in Asia/Colombo. */
export const TimeHHmmSchema = z
  .string()
  .regex(TIME_REGEX, 'must match HH:mm (e.g. "14:30")');

export type TimeHHmm = z.infer<typeof TimeHHmmSchema>;

/** Bilingual text; both Sinhala and English are required (1–80 chars each). */
export const LocalizedTextSchema = z.object({
  si: z.string().min(1).max(80),
  en: z.string().min(1).max(80),
});

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Bus operator type. CTB = Ceylon Transport Board, PVT = private. */
export const OperatorSchema = z.enum(['CTB', 'PVT']);
export type Operator = z.infer<typeof OperatorSchema>;

/** Service comfort level. */
export const ServiceTypeSchema = z.enum(['NORMAL', 'SEMI_LUXURY', 'LUXURY', 'EXPRESS']);
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

/**
 * ISO weekday number: 1 = Monday … 7 = Sunday.
 * This refers to the weekday on which the bus DEPARTS from the stand.
 */
export const WeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export type Weekday = z.infer<typeof WeekdaySchema>;

// ---------------------------------------------------------------------------
// BusService
// ---------------------------------------------------------------------------

export const BusServiceSchema = z.object({
  /** UUID v4 — must be unique across the entire services array. */
  id: z.string().uuid(),

  /** Final destination of this bus (e.g. Colombo). */
  destination: LocalizedTextSchema,

  /**
   * Origin of this bus as it passes through Mahiyanganaya stand.
   * Displayed as "සිට:" (from).
   */
  origin: LocalizedTextSchema,

  /**
   * Intermediate stop between origin and destination.
   * Displayed as "හරහා" (via). Null when the route is direct.
   */
  via: LocalizedTextSchema.nullable(),

  operator: OperatorSchema,
  serviceType: ServiceTypeSchema,

  /**
   * Time the bus arrives AT this stand (Asia/Colombo wall clock).
   * Null when the stand is the trip origin.
   */
  arrival: TimeHHmmSchema.nullable(),

  /**
   * Time the bus DEPARTS this stand (Asia/Colombo wall clock).
   * Most important field — the TV display sorts by this.
   */
  departure: TimeHHmmSchema,

  /**
   * "ආරම්භය" — when the whole trip started (at trip origin).
   * Null when this stand is the trip origin.
   */
  tripStart: TimeHHmmSchema.nullable(),

  /**
   * "ගමනාන්තය" — expected arrival time at the final destination.
   * Null when unknown.
   */
  destinationArrival: TimeHHmmSchema.nullable(),

  /** Platform/bay label shown on the display (1–4 characters). Null = not assigned. */
  bay: z.string().min(1).max(4).nullable(),

  /**
   * Weekdays this service runs (ISO 1=Mon…7=Sun). At least one day required.
   * Times after midnight (e.g. 00:30) belong to the NEXT calendar day
   * relative to an evening reader, but `days` still refers to the departure weekday.
   */
  days: z.array(WeekdaySchema).min(1),

  /** false = service is hidden from the TV display without being deleted. */
  active: z.boolean(),
});

export type BusService = z.infer<typeof BusServiceSchema>;

// ---------------------------------------------------------------------------
// AlertBanner
// ---------------------------------------------------------------------------

export const AlertSeveritySchema = z.enum(['INFO', 'WARNING', 'CRITICAL']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertBannerSchema = z.object({
  enabled: z.boolean(),
  severity: AlertSeveritySchema,
  text: LocalizedTextSchema,
  /** ISO 8601 UTC timestamp after which the alert is auto-dismissed. Null = never expires. */
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export type AlertBanner = z.infer<typeof AlertBannerSchema>;

// ---------------------------------------------------------------------------
// DisplaySettings
// ---------------------------------------------------------------------------

export const DisplaySettingsSchema = z.object({
  /** Number of bus rows shown per page. Default 3, range 2–6. */
  rowsPerPage: z.number().int().min(2).max(6),

  /** Seconds each page is shown before rotating. Default 12, range 6–30. */
  dwellSeconds: z.number().int().min(6).max(30),

  /** Cross-fade animation duration in milliseconds. Default 300, range 0–1000. */
  fadeMs: z.number().int().min(0).max(1000),

  /**
   * How many minutes after a scheduled departure the row stays visible.
   * Default 5, range 0–15.
   */
  departedGraceMinutes: z.number().int().min(0).max(15),

  /**
   * Departures within this many minutes are highlighted as "SOON".
   * Default 15, range 5–60.
   */
  soonThresholdMinutes: z.number().int().min(5).max(60),

  /**
   * How many hours ahead to show departures from "now".
   * Default 8, range 1–24.
   */
  lookaheadHours: z.number().int().min(1).max(24),

  /**
   * Dead zone around the TV screen edge as a percentage of screen dimension.
   * Default 3.5, range 0–10.
   */
  safeAreaPercent: z.number().min(0).max(10),

  /**
   * How often the TV app polls the API for a fresh schedule (seconds).
   * Default 180, range 60–3600.
   */
  pollIntervalSeconds: z.number().int().min(60).max(3600),

  /**
   * Local Asia/Colombo time at which the TV app does a hard page reload
   * (clears stale state). Default "02:30".
   */
  reloadAtLocalTime: TimeHHmmSchema,
});

export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

/** Exported defaults so both the TV app and admin portal can share them. */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  rowsPerPage: 3,
  dwellSeconds: 12,
  fadeMs: 300,
  departedGraceMinutes: 5,
  soonThresholdMinutes: 15,
  lookaheadHours: 8,
  safeAreaPercent: 3.5,
  pollIntervalSeconds: 180,
  reloadAtLocalTime: '02:30',
};

// ---------------------------------------------------------------------------
// ScheduleDocument — root object
// ---------------------------------------------------------------------------

const ScheduleDocumentBaseSchema = z.object({
  /** Must always be the integer literal 1. */
  schemaVersion: z.literal(1),

  /** Monotonically increasing integer; +1 on every publish. */
  version: z.number().int().positive(),

  /** ISO 8601 UTC timestamp when this document was published. */
  publishedAt: z.string().datetime({ offset: true }),

  /**
   * "YYYY-MM-DD" date when a human operator last verified the timetable
   * against the official schedule board.
   */
  lastVerified: z.string().date(),

  /** All times in this document are Asia/Colombo. This field documents that. */
  timezone: z.literal('Asia/Colombo'),

  station: z.object({
    name: LocalizedTextSchema,
    /** Public-facing mobile URL — MUST use https. */
    mobileUrl: z.string().url().startsWith('https://'),
  }),

  /** Active alert shown as a banner on the TV display. Null = no alert. */
  alert: AlertBannerSchema.nullable(),

  display: DisplaySettingsSchema,

  /** Maximum 300 services. Duplicate ids must fail validation (checked post-parse). */
  services: z.array(BusServiceSchema).max(300),
});

/**
 * Full Zod schema for ScheduleDocument, including the duplicate-id cross-check.
 *
 * Use `ScheduleDocumentSchema.parse(input)` or `validateScheduleDocument(input)`.
 */
export const ScheduleDocumentSchema = ScheduleDocumentBaseSchema.superRefine((doc, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < doc.services.length; i++) {
    const svc = doc.services[i];
    if (svc === undefined) continue;
    if (seen.has(svc.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['services', i, 'id'],
        message: `duplicate service id "${svc.id}"`,
      });
    }
    seen.add(svc.id);
  }
});

export type ScheduleDocument = z.infer<typeof ScheduleDocumentSchema>;

// ---------------------------------------------------------------------------
// Validator utility
// ---------------------------------------------------------------------------

type ValidationSuccess = { ok: true; data: ScheduleDocument };
type ValidationFailure = { ok: false; errors: string[] };
export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate an unknown value as a ScheduleDocument.
 *
 * Returns `{ ok: true, data }` on success, or `{ ok: false, errors }` where
 * each error string contains a human-readable path and message, e.g.
 *   "services[4].departure: must match HH:mm (e.g. \"14:30\")"
 */
export function validateScheduleDocument(input: unknown): ValidationResult {
  const result = ScheduleDocumentSchema.safeParse(input);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    // Format path: ["services", 4, "departure"] → "services[4].departure"
    const path = issue.path
      .map((segment, idx) => {
        if (typeof segment === 'number') {
          return `[${segment}]`;
        }
        return idx === 0 ? segment : `.${segment}`;
      })
      .join('');

    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return { ok: false, errors };
}

