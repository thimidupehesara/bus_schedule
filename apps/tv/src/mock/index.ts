import { DEFAULT_DISPLAY_SETTINGS, type ScheduleDocument } from '@bus-schedule/shared';

const options = () => new URLSearchParams(location.search);

export function previewTime(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const value = options().get('now');
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const epoch = Date.parse(value + '+05:30');
  if (!Number.isFinite(epoch)) return undefined;
  return epoch;
}

export function previewUnavailable(): boolean {
  return import.meta.env.DEV && options().has('unavailable');
}

export async function loadMockIfRequested(): Promise<ScheduleDocument | null> {
  if (!import.meta.env.DEV || !options().has('mock')) return null;
  const { mockSchedule } = await import('./mock-schedule.js');
  const params = options();
  const rows = Number(params.get('rows'));
  return {
    ...mockSchedule,
    services: [
      ...mockSchedule.services,
      ...['00:12', '00:18'].map((departure, index) => ({
        ...mockSchedule.services[index]!,
        id: '00000000-0000-4000-8000-00000000010' + index,
        departure,
        arrival: null,
      })),
    ],
    display: {
      ...DEFAULT_DISPLAY_SETTINGS,
      rowsPerPage:
        Number.isInteger(rows) && rows >= 3 && rows <= 6
          ? rows
          : DEFAULT_DISPLAY_SETTINGS.rowsPerPage,
    },
    alert:
      params.get('alert') === 'critical'
        ? {
            enabled: true,
            severity: 'CRITICAL',
            expiresAt: null,
            text: {
              si: 'අද පිටත්වීම් වෙනස් විය හැක. කරුණාකර කාර්ය මණ්ඩලයෙන් විමසන්න.',
              en: 'Departures may change today. Please check with station staff.',
            },
          }
        : null,
  };
}
