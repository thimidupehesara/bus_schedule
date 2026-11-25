import { expect, it } from 'vitest';
import worker, { type Env } from '../index.js';

it('serves public Privacy Policy page at /privacy without authentication', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/privacy'),
    {} as Env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  
  const html = await response.text();
  expect(html).toContain('Privacy Policy');
  expect(html).toContain('Mahiyanganaya Bus Timetable');
  expect(html).toContain('lk.mahiyanganaya.busmobile');
  expect(html).toContain('Thimidu Pehesara');
  expect(html).toContain('pehesarathimidu130@gmail.com');
  expect(html).toContain('No Personal Information');
  expect(html).toContain('Offline Caching');
});

it('serves public Privacy Policy page at /privacy/ as well', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/privacy/'),
    {} as Env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
});

it('serves admin APK download at /downloads/mahiyanganaya-bus-admin.apk with proper headers', async () => {
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.android.package-archive' },
        }),
    } as unknown as Fetcher,
  } as Env;
  const response = await worker.fetch(
    new Request('https://example.test/downloads/mahiyanganaya-bus-admin.apk'),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
  expect(response.headers.get('Content-Disposition')).toContain('mahiyanganaya-bus-admin.apk');
});
