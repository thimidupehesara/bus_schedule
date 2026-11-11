export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const ok = (data: Record<string, unknown> = {}, status = 200) =>
  Response.json({ ok: true, ...data }, { status });
export const fail = (error: ApiError) =>
  Response.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    { status: error.status },
  );
export function checkCsrf(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (
    request.headers.get('X-Requested-With') !== 'XMLHttpRequest' ||
    request.headers.get('Origin') !== new URL(request.url).origin
  )
    throw new ApiError(
      403,
      'CSRF',
      'A same-origin request with X-Requested-With: XMLHttpRequest is required.',
    );
}
export async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new ApiError(415, 'CONTENT_TYPE', 'Use application/json.');
  const limit = 1024 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new ApiError(413, 'BODY_TOO_LARGE', 'Maximum request size is 1 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Maximum request size is 1 MB.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Invalid JSON.');
  }
}
export function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ApiError(400, 'INVALID_BODY', 'Expected a JSON object.');
  return raw as Record<string, unknown>;
}
export function security(response: Response, api = false): Response {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  result.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (api) result.headers.set('Cache-Control', 'no-store');
  return result;
}
