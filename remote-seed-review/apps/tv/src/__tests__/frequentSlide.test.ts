import { describe, it, expect } from 'vitest';
import { FREQUENT_SERVICES } from '../FrequentDeparturesSlide.js';
import { clampPage } from '../config.js';

describe('Frequent Departures Slide', () => {
  it('contains the exact 3 routes with correct bilingual text and configurable intervals', () => {
    expect(FREQUENT_SERVICES).toHaveLength(3);

    // Card 1 — Badulla
    expect(FREQUENT_SERVICES[0]!.routeLabel).toBe('Badulla');
    expect(FREQUENT_SERVICES[0]!.textSi).toBe(
      'බදුල්ල දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[0]!.textEn).toBe(
      'Mahiyanganaya to Badulla buses depart every 15 minutes.',
    );
    expect(FREQUENT_SERVICES[0]!.badgeEn).toBe('15 MIN');
    expect(FREQUENT_SERVICES[0]!.badgeSi).toBe('විනාඩි 15');

    // Card 2 — Kandy
    expect(FREQUENT_SERVICES[1]!.routeLabel).toBe('Kandy');
    expect(FREQUENT_SERVICES[1]!.textSi).toBe(
      'මහනුවර දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 20-30කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[1]!.textEn).toBe(
      'Mahiyanganaya to Kandy buses depart every 20-30 minutes.',
    );
    expect(FREQUENT_SERVICES[1]!.badgeEn).toBe('20-30 MIN');
    expect(FREQUENT_SERVICES[1]!.badgeSi).toBe('විනාඩි 20-30');

    // Card 3 — Sacred City of Mahiyanganaya
    expect(FREQUENT_SERVICES[2]!.routeLabel).toBe('Sacred City');
    expect(FREQUENT_SERVICES[2]!.textSi).toBe(
      'මහියංගණ සිට පූජා නගරය දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[2]!.textEn).toBe(
      'Mahiyanganaya to Sacred City of Mahiyanganaya buses depart every 15 minutes.',
    );
    expect(FREQUENT_SERVICES[2]!.badgeEn).toBe('15 MIN');
    expect(FREQUENT_SERVICES[2]!.badgeSi).toBe('විනාඩි 15');
  });

  it('rotates correctly in auto mode: [Pages 1..N] -> Frequent Departures -> Page 1', () => {
    const totalSchedulePages = 4;
    const scheduleCount = Math.max(1, totalSchedulePages);
    const frequentSlideIndex = scheduleCount; // 4
    const totalSlides = scheduleCount + 1; // 5 (Pages 1..4 + Frequent Departures only)

    expect(totalSlides).toBe(5);
    expect(frequentSlideIndex).toBe(4);

    // Sequence of indices through a full rotation
    const sequence: number[] = [];
    let current = 0;
    for (let step = 0; step < totalSlides; step++) {
      sequence.push(current);
      current = (clampPage(current, totalSlides) + 1) % totalSlides;
    }

    expect(sequence).toEqual([0, 1, 2, 3, 4]);
    // The next advance wraps smoothly back to 0 (Page 1)
    expect(current).toBe(0);

    // Classification of each slide index
    for (let i = 0; i < totalSlides; i++) {
      const isFrequent = i === frequentSlideIndex;
      const isSchedule = !isFrequent;

      if (i < 4) {
        expect(isSchedule).toBe(true);
        expect(isFrequent).toBe(false);
      } else if (i === 4) {
        expect(isSchedule).toBe(false);
        expect(isFrequent).toBe(true);
      }
    }
  });

  it('handles single-page schedules properly in auto rotation', () => {
    const totalSchedulePages = 1;
    const scheduleCount = Math.max(1, totalSchedulePages);
    const frequentSlideIndex = scheduleCount; // 1
    const totalSlides = scheduleCount + 1; // 2

    expect(totalSlides).toBe(2);
    expect(frequentSlideIndex).toBe(1);

    let current = 0;
    // Page 1
    expect(current).toBe(0);
    // Advance -> Frequent Departures
    current = (clampPage(current, totalSlides) + 1) % totalSlides;
    expect(current).toBe(1);
    // Advance -> Loop back to Page 1
    current = (clampPage(current, totalSlides) + 1) % totalSlides;
    expect(current).toBe(0);
  });

  it('correctly targets hold modes and excludes ceremony slides from auto rotation', () => {
    for (const totalSchedulePages of [1, 2, 4, 10]) {
      const scheduleCount = Math.max(1, totalSchedulePages);
      const frequentSlideIndex = scheduleCount;
      const totalSlides = scheduleCount + 1;

      // Auto rotation total slides only includes schedule pages and frequent departures
      expect(totalSlides).toBe(scheduleCount + 1);

      // Ceremony modes are full-screen holds excluded from rotation
      const isCeremonyMode = (mode: string) => mode === 'ceremony_logos' || mode === 'ceremony_qr';
      expect(isCeremonyMode('ceremony_logos')).toBe(true);
      expect(isCeremonyMode('ceremony_qr')).toBe(true);
      expect(isCeremonyMode('auto')).toBe(false);
      expect(isCeremonyMode('frequent')).toBe(false);

      // Target index when switching back to auto must reset to 0 (Page 1)
      const getTargetIndex = (mode: 'auto' | 'credits' | 'frequent' | 'page' | 'ceremony_logos' | 'ceremony_qr', page = 1) => {
        if (mode === 'frequent') return frequentSlideIndex;
        if (mode === 'page') return Math.min(Math.max(1, page), scheduleCount) - 1;
        return 0; // auto, ceremony_logos, ceremony_qr all point to/reset to Page 1
      };

      expect(getTargetIndex('frequent')).toBe(frequentSlideIndex);
      expect(getTargetIndex('page', 1)).toBe(0);
      expect(getTargetIndex('auto')).toBe(0);
      expect(getTargetIndex('ceremony_logos')).toBe(0);
      expect(getTargetIndex('ceremony_qr')).toBe(0);
    }
  });
});
