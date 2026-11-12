// DEV ONLY. Never bundled into production.
// Long-name stress fixture for validating FittedText at extreme column widths.
// Loaded only when ?mock=1&stress=1 is in the URL.
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';
import { DEFAULT_DISPLAY_SETTINGS, type BusService, type ScheduleDocument } from '@bus-schedule/shared';

// 25-character English place name (count the characters: "Dehiattakandiya Central B" = 25)
const LONG_EN = 'Dehiattakandiya Central B';
// 80-character Sinhala destination name (owner must verify the Sinhala)
const LONG_SI =
  'දෙහිඅත්තකන්දිය මධ්‍යම බස් නැවතුම්පොළ, ශ්‍රී ලංකා ගමනාගමන මණ්ඩල සේවාව, කොළඹ';

const shiftedTime = (base: string, deltaMinutes: number): string => {
  const totalMinutes =
    (Number(base.slice(0, 2)) * 60 + Number(base.slice(3)) + deltaMinutes + 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};

const departures = [
  '00:12',
  '00:18',
  '05:30',
  '08:00',
  '10:15',
  '12:30',
  '14:00',
  '15:37',
  '17:00',
  '19:30',
  '21:00',
  '23:00',
];

const makeService = (departure: string, index: number): BusService => ({
  id: `aaaaaaaa-bbbb-4ccc-dddd-${String(index).padStart(12, '0')}`,
  destination: { en: LONG_EN, si: LONG_SI },
  origin: { en: 'Mahiyanganaya', si: 'මහියංගනය' },
  via:
    index % 3 === 0
      ? { en: 'Ampara Town Centre', si: 'අම්පාර නගර මධ්‍යය' }
      : null,
  operator: index % 2 === 0 ? 'CTB' : 'PVT',
  serviceType: (['NORMAL', 'SEMI_LUXURY', 'LUXURY', 'EXPRESS'] as const)[index % 4]!,
  departure,
  arrival: index % 2 === 0 ? shiftedTime(departure, -15) : null,
  tripStart: null,
  destinationArrival: null,
  bay: index % 3 === 0 ? `B${(index % 5) + 1}` : null,
  days: [1, 2, 3, 4, 5, 6, 7],
  active: true,
});

export const stressSchedule: ScheduleDocument = {
  schemaVersion: 1,
  version: 1,
  publishedAt: '2026-11-09T00:00:00Z',
  lastVerified: '2026-11-09',
  timezone: 'Asia/Colombo',
  station: {
    name: { en: 'Mahiyanganaya DEV — Stress Test', si: 'මහියංගනය DEV — ආතතිය පරීක්‍ෂාව' },
    mobileUrl: 'https://example.invalid',
  },
  alert: null,
  display: {
    ...DEFAULT_DISPLAY_SETTINGS,
    safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT,
  },
  services: departures.map(makeService),
};
