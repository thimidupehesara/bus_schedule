import type { ScheduleDocument } from '@bus-schedule/shared';

export async function loadMockIfRequested(): Promise<ScheduleDocument | null> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    return (await import('./mock-schedule.js')).mockSchedule;
  }
  return null;
}
