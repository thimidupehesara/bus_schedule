/**
 * Cloudflare Worker — bus-display-api
 *
 * Routes:
 *   GET /health  → { ok: true }
 *
 * Additional routes (schedule, admin API) will be added in later prompts.
 */

export interface Env {
  // D1 binding is defined in wrangler.toml (currently commented out).
  // DB: D1Database;
}

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

