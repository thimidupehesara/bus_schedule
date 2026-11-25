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

it('serves MTBA admin APK download at /downloads/mtba-admin.apk with proper headers', async () => {
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
    new Request('https://example.test/downloads/mtba-admin.apk'),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
  expect(response.headers.get('Content-Disposition')).toContain('mtba-admin.apk');
});

it('serves admin manifest and sw.js with proper content-type and no-cache headers', async () => {
  const env = {
    ASSETS: {
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/admin/manifest.webmanifest') {
          return new Response(JSON.stringify({ short_name: 'MTBA' }), {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.pathname === '/admin/sw.js') {
          return new Response('console.log("sw")', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return new Response('Not found', { status: 404 });
      },
    } as unknown as Fetcher,
  } as Env;

  const manifestRes = await worker.fetch(
    new Request('https://example.test/admin/manifest.webmanifest'),
    env,
  );
  expect(manifestRes.status).toBe(200);
  expect(manifestRes.headers.get('Content-Type')).toBe('application/manifest+json');
  expect(manifestRes.headers.get('Cache-Control')).toBe('no-cache');

  const swRes = await worker.fetch(
    new Request('https://example.test/admin/sw.js'),
    env,
  );
  expect(swRes.status).toBe(200);
  expect(swRes.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
  expect(swRes.headers.get('Cache-Control')).toBe('no-cache');
});
