import { expect, it } from 'vitest';
import worker, { type Env } from '../index.js';

it('serves public Asset Links without using any bindings', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/.well-known/assetlinks.json'),
    {} as Env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-cache');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(Array.isArray(await response.json())).toBe(true);
});
