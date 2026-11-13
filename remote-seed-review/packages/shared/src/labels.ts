// OWNER MUST REVIEW ALL SINHALA TEXT
import type { BusService, TimeHHmm } from './schema.js';
import { SI_AM, SI_PM, to12h } from './time-format.js';

export const LABELS = {
  from: { si: 'ගමනාරම්භය', en: 'From' },
  destination: { si: 'ගමනාන්තය', en: 'Destination' },
  arrival: { si: 'පැමිණෙන වේලාව', en: 'Arrival' },
  departure: { si: 'පිටත්වන වේලාව', en: 'Departure' },
  service: { si: 'සේවා වර්ගය', en: 'Service' },
  via: { si: 'හරහා', en: 'Via' },
  bay: { si: 'වේදිකාව', en: 'Bay' },
  departed: { si: 'පිටත් විය', en: 'Departed' },
  tomorrow: { si: 'හෙට', en: 'Tomorrow' },
  page: { si: 'පිටුව', en: 'Page' },
  lastVerified: { si: 'අවසන් වරට තහවුරු කළේ', en: 'Last verified' },
  title: { si: 'දුර ගමන් බස් රථ ධාවන කාලසටහන', en: 'Long Distance Bus Timetable' },
  clockSyncing: { si: 'වේලාව සකසමින්...', en: 'Clock syncing...' },
  timetableUnavailable: { si: 'කාලසටහන නොමැත', en: 'Timetable unavailable' },
  scanForPhone: { si: 'දුරකථනයෙන් බලන්න', en: 'View on your phone' },
  serviceTypes: {
    NORMAL: { si: 'සාමාන්‍ය', en: 'Normal' },
    SEMI_LUXURY: { si: 'අර්ධ සුඛෝපභෝගී', en: 'Semi-Luxury' },
    LUXURY: { si: 'සුඛෝපභෝගී', en: 'Luxury' },
    EXPRESS: { si: 'අධිවේගී', en: 'Express' },
  },
} as const;

export function meridiemBilingual(hhmm: TimeHHmm) {
  const { hour, minute, meridiem } = to12h(hhmm);
  return { clock: `${hour}:${minute}`, en: meridiem, si: meridiem === 'AM' ? SI_AM : SI_PM };
}

export function serviceLabel(
  operator: BusService['operator'],
  serviceType: BusService['serviceType'],
) {
  return { operator, type: LABELS.serviceTypes[serviceType] };
}
