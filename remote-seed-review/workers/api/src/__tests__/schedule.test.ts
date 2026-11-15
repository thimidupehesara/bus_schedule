import { describe, expect, it } from 'vitest';
import { ScheduleDocumentSchema, validateServiceStrict } from '@bus-schedule/shared';
import sample from '../../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import {
  hasChanges,
  makeEtag,
  matchesEtag,
  nextVersion,
  publishWarnings,
  scheduleDiff,
  sortServices,
  validateDocument,
} from '../schedule.js';
const document = () => ScheduleDocumentSchema.parse(structuredClone(sample));
describe('snapshot contract', () => {
  it('creates a strong deterministic content-dependent ETag', async () => {
    const etag = await makeEtag(1, 'hello');
    expect(etag).toBe('"v1-2cf24dba5fb0a30e"');
    expect(await makeEtag(2, 'hello')).not.toBe(etag);
    expect(await makeEtag(1, 'hello!')).not.toBe(etag);
  });
  it.each(['"v1-abc"', 'W/"v1-abc"', '"other", W/"v1-abc"', '*', '  "v1-abc" '])(
    'matches conditional request %s',
    (value) => expect(matchesEtag(value, '"v1-abc"')).toBe(true),
  );
  it.each([null, '', 'v1-abc', '"v1-abcd"', 'W/"different"'])('does not match %s', (value) =>
    expect(matchesEtag(value, '"v1-abc"')).toBe(false),
  );
  it('allocates after the highest version, never the rollback target', () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(52)).toBe(53);
  });
  it('diffs service fields and metadata without publication stamp noise', () => {
    const live = document(),
      draft = document();
    draft.version++;
    draft.publishedAt = new Date().toISOString();
    expect(hasChanges(live, draft)).toBe(false);
    draft.services[0]!.departure = '01:05';
    draft.services.pop();
    draft.services.push({ ...draft.services[1]!, id: crypto.randomUUID() });
    draft.station.mobileUrl = 'https://example.com';
    draft.display.dwellSeconds = 13;
    expect(scheduleDiff(live, draft).displayChanged).toBe(false);
    draft.display.departedGraceMinutes = 20;
    draft.lastVerified = '2026-11-10';
    draft.alert = { enabled: false, severity: 'INFO', text: { en: '', si: '' }, expiresAt: null };
    const diff = scheduleDiff(live, draft);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.fields).toEqual([
      { field: 'departure', before: live.services[0]!.departure, after: '01:05' },
    ]);
    expect(diff).toMatchObject({
      alertChanged: true,
      displayChanged: true,
      stationChanged: true,
      lastVerifiedChanged: true,
    });
  });
  it('validates the whole document and every service', () => {
    const d = document();
    d.services[0]!.destination.si = 'Colombo';
    expect(validateDocument(d).validation.ok).toBe(false);
    d.services = Array.from({ length: 301 }, () => ({
      ...d.services[1]!,
      id: crypto.randomUUID(),
    }));
    expect(validateDocument(d).validation.errors.some((e) => e.code === 'SCHEMA')).toBe(true);
  });
  it('warns about drops, zero active, staleness, expired alerts and near duplicates', () => {
    const live = document(),
      draft = document();
    draft.services = draft.services.slice(0, 1).map((s) => ({ ...s, active: false }));
    draft.lastVerified = '2026-10-01';
    draft.alert = {
      enabled: true,
      severity: 'INFO',
      text: { si: 'නිවේදනය', en: 'Notice' },
      expiresAt: '2026-01-01T00:00:00Z',
    };
    const codes = publishWarnings(draft, live, new Date('2026-11-11')).map((w) => w.code);
    for (const code of ['COUNT_DROPPED', 'NO_ACTIVE_SERVICES', 'VERIFICATION_OLD', 'ALERT_EXPIRED'])
      expect(codes).toContain(code);
    draft.services = [
      live.services[0]!,
      { ...live.services[0]!, id: crypto.randomUUID(), departure: '01:34' },
    ];
    expect(
      publishWarnings(draft, live).some(
        (w) => w.code === 'NEAR_DUPLICATE' && w.serviceId && w.severity === 'warning',
      ),
    ).toBe(true);
  });
  it('counts busy hours by actual departure day', () => {
    const draft = document();
    draft.services = Array.from({ length: 21 }, (_, i) => ({
      ...draft.services[0]!,
      id: crypto.randomUUID(),
      departure: `08:${String(i).padStart(2, '0')}`,
      arrival: null,
      days: [1],
    }));
    expect(publishWarnings(draft, null).filter((w) => w.code === 'BUSY_HOUR')).toHaveLength(1);
  });
  it('safely handles corrupted or malformed services without throwing', () => {
    const malformed = [
      {
        id: 'bad-1',
        destination: null as any,
        origin: null as any,
        departure: '--:--',
        arrival: null,
        via: null,
        tripStart: null,
        destinationArrival: null,
        operator: 'PVT' as const,
        serviceType: 'NORMAL' as const,
        days: [1 as const],
        bay: null,
        active: true,
      },
      {
        id: 'bad-2',
        destination: { si: 'කොළඹ' } as any, // missing .en
        origin: { si: 'මහියංගනය' } as any,
        departure: '06:30',
        arrival: null,
        via: null,
        tripStart: null,
        destinationArrival: null,
        operator: 'PVT' as const,
        serviceType: 'NORMAL' as const,
        days: [1 as const],
        bay: null,
        active: true,
      },
    ];
    // sortServices should not throw
    const sorted = sortServices(malformed as any);
    expect(sorted).toHaveLength(2);

    // scheduleDiff should not throw
    const draft = {
      ...document(),
      services: malformed as any,
    };
    const diff = scheduleDiff(document(), draft);
    expect(diff.changed).toBeDefined();

    // publishWarnings should not throw
    const warnings = publishWarnings(draft, null);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

it('indexed validation preserves all strict service errors and warnings', () => {
  const doc = document();
  doc.services = doc.services.slice(0, 8).map(service => ({ ...service, bay: 'A', days: ['MON', 'WED', 'SUN'] }));
  const duplicate = { ...doc.services[0]!, id: crypto.randomUUID() };
  doc.services.push(duplicate);
  const indexed = validateDocument(doc);
  const sorted = (issues: unknown[]) => issues.map(issue => JSON.stringify(issue)).sort();
  for (const row of indexed.issues) {
    const expected = validateServiceStrict(doc.services.find(service => service.id === row.serviceId), doc);
    expect(sorted(row.errors)).toEqual(sorted(expected.errors));
    expect(sorted(row.warnings)).toEqual(sorted(expected.warnings));
  }
  expect(publishWarnings(doc, null, new Date(), indexed)).toEqual(publishWarnings(doc, null));
});
