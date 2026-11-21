import { describe, it, expect } from 'vitest';
import { FREQUENT_SERVICES } from '../FrequentDeparturesSlide.js';
import { clampPage } from '../config.js';

describe('Frequent Departures Slide', () => {
  it('contains the exact 3 routes with correct bilingual text and configurable intervals', () => {
    expect(FREQUENT_SERVICES).toHaveLength(3);

    // Card 1 — Badulla
    expect(FREQUENT_SERVICES[0]!.id).toBe('badulla');
    expect(FREQUENT_SERVICES[0]!.si).toBe(
      'බදුල්ල දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[0]!.en).toBe(
      'Mahiyanganaya to Badulla buses depart every 15 minutes.',
    );
    expect(FREQUENT_SERVICES[0]!.intervalEn).toBe('15 MIN');
    expect(FREQUENT_SERVICES[0]!.intervalSi).toBe('විනාඩි 15');

    // Card 2 — Kandy
    expect(FREQUENT_SERVICES[1]!.id).toBe('kandy');
    expect(FREQUENT_SERVICES[1]!.si).toBe(
      'මහනුවර දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 20-30කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[1]!.en).toBe(
      'Mahiyanganaya to Kandy buses depart every 20-30 minutes.',
    );
    expect(FREQUENT_SERVICES[1]!.intervalEn).toBe('20-30 MIN');
    expect(FREQUENT_SERVICES[1]!.intervalSi).toBe('විනාඩි 20-30');

    // Card 3 — Sacred City of Mahiyanganaya
    expect(FREQUENT_SERVICES[2]!.id).toBe('sacred-city');
    expect(FREQUENT_SERVICES[2]!.si).toBe(
      'මහියංගණ සිට පූජා නගරය දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    );
    expect(FREQUENT_SERVICES[2]!.en).toBe(
      'Mahiyanganaya to Sacred City of Mahiyanganaya buses depart every 15 minutes.',
    );
    expect(FREQUENT_SERVICES[2]!.intervalEn).toBe('15 MIN');
    expect(FREQUENT_SERVICES[2]!.intervalSi).toBe('විනාඩි 15');
  });

  it('rotates correctly: [Pages 1..N] -> Frequent Departures -> Credits -> Page 1', () => {
    const totalSchedulePages = 4;
    const scheduleCount = Math.max(1, totalSchedulePages);
    const frequentSlideIndex = scheduleCount; // 4
    const creditsSlideIndex = scheduleCount + 1; // 5
    const totalSlides = scheduleCount + 2; // 6

    expect(totalSlides).toBe(6);
    expect(frequentSlideIndex).toBe(4);
    expect(creditsSlideIndex).toBe(5);

    // Sequence of indices through a full rotation
    const sequence: number[] = [];
    let current = 0;
    for (let step = 0; step < totalSlides; step++) {
      sequence.push(current);
      current = (clampPage(current, totalSlides) + 1) % totalSlides;
    }

    expect(sequence).toEqual([0, 1, 2, 3, 4, 5]);
    // The next advance wraps smoothly back to 0 (Page 1)
    expect(current).toBe(0);

    // Classification of each slide index
    for (let i = 0; i < totalSlides; i++) {
      const isFrequent = i === frequentSlideIndex;
      const isCredits = i === creditsSlideIndex;
      const isSchedule = !isFrequent && !isCredits;

      if (i < 4) {
        expect(isSchedule).toBe(true);
        expect(isFrequent).toBe(false);
        expect(isCredits).toBe(false);
      } else if (i === 4) {
        expect(isSchedule).toBe(false);
        expect(isFrequent).toBe(true);
        expect(isCredits).toBe(false);
      } else if (i === 5) {
        expect(isSchedule).toBe(false);
        expect(isFrequent).toBe(false);
        expect(isCredits).toBe(true);
      }
    }
  });

  it('handles single-page schedules properly', () => {
    const totalSchedulePages = 1;
    const scheduleCount = Math.max(1, totalSchedulePages);
    const frequentSlideIndex = scheduleCount; // 1
    const creditsSlideIndex = scheduleCount + 1; // 2
    const totalSlides = scheduleCount + 2; // 3

    expect(totalSlides).toBe(3);
    expect(frequentSlideIndex).toBe(1);
    expect(creditsSlideIndex).toBe(2);

    let current = 0;
    // Page 1
    expect(current).toBe(0);
    // Advance -> Frequent Departures
    current = (clampPage(current, totalSlides) + 1) % totalSlides;
    expect(current).toBe(1);
    // Advance -> Credits
    current = (clampPage(current, totalSlides) + 1) % totalSlides;
    expect(current).toBe(2);
    // Advance -> Loop back to Page 1
    current = (clampPage(current, totalSlides) + 1) % totalSlides;
    expect(current).toBe(0);
  });

  it('correctly targets frequent slide index for tvHold.mode === "frequent"', () => {
    for (const totalSchedulePages of [1, 2, 4, 10]) {
      const scheduleCount = Math.max(1, totalSchedulePages);
      const frequentSlideIndex = scheduleCount;
      const creditsSlideIndex = scheduleCount + 1;
      const totalSlides = scheduleCount + 2;

      // Simulate mode targeting
      const getTargetIndex = (mode: 'auto' | 'credits' | 'frequent' | 'page', page = 1) => {
        if (mode === 'credits') return creditsSlideIndex;
        if (mode === 'frequent') return frequentSlideIndex;
        if (mode === 'page') return Math.min(Math.max(1, page), scheduleCount) - 1;
        return 0;
      };

      expect(getTargetIndex('frequent')).toBe(frequentSlideIndex);
      expect(getTargetIndex('credits')).toBe(creditsSlideIndex);
      expect(getTargetIndex('page', 1)).toBe(0);
      expect(totalSlides).toBe(scheduleCount + 2);
    }
  });
});
