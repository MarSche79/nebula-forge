import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || '';

// Allow-list of API paths the portal will proxy. Anything else returns 404.
// Each entry is either an exact string or a `RegExp` anchored to a single
// API path. Keeping this explicit (no broad prefix matching) prevents the
// catch-all proxy from being abused as an SSRF / arbitrary-API gateway.
const STATIC_ALLOWED_PATHS = new Set<string>([
  'health',
  'me',
  'agents',
  'chat',
  'chat/reset',
  'applications',
  'applications/counts',
  'applications/cleanup-demo',
  'demo/submit',
  'board/agents',
  'board/tasks',
  'board/activity',
]);
const ALLOWED_PATH_PATTERNS: RegExp[] = [
  /^applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/decision$/i,
  /^board\/tasks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^board\/tasks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/dispatch$/i,
];
function isAllowedPath(p: string): boolean {
  if (STATIC_ALLOWED_PATHS.has(p)) return true;
  return ALLOWED_PATH_PATTERNS.some((rx) => rx.test(p));
}

// Headers we strip from the *incoming* browser request before forwarding,
// to prevent a malicious client from spoofing identity or auth context.
// X-MS-* and X-Forwarded-* are added by the Easy Auth sidecar / Container Apps
// ingress *server-side* — anything the browser sends with those names must
// be discarded so the API can trust them. X-Proxy-Auth is the shared secret
// the portal injects to the API; the browser must never set it.
const BLOCKED_INBOUND_HEADER_PREFIXES = [
  'x-ms-',
  'x-forwarded-',
];
const BLOCKED_INBOUND_HEADERS = new Set<string>([
  'authorization',
  'cookie',
  'host',
  'connection',
  'content-length',
  'x-proxy-auth',
]);

function readEasyAuthHeaders(req: NextRequest): {
  principal?: string;
  principalName?: string;
  principalId?: string;
} {
  // These are added by the Easy Auth sidecar after the request reaches the
  // platform — the browser cannot set them, because we strip incoming x-ms-*
  // before forwarding (see BLOCKED_INBOUND_HEADER_PREFIXES).
  return {
    principal: req.headers.get('x-ms-client-principal') ?? undefined,
    principalName: req.headers.get('x-ms-client-principal-name') ?? undefined,
    principalId: req.headers.get('x-ms-client-principal-id') ?? undefined,
  };
}

async function proxy(
  req: NextRequest,
  params: { path?: string[] },
): Promise<Response> {
  if (!API_BASE) {
    return new Response(
      JSON.stringify({ error: 'API_BASE_URL not configured on portal container' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  const subPath = (params.path || []).join('/');
  if (!isAllowedPath(subPath)) {
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  }

  const search = req.nextUrl.search || '';
  const targetUrl = `${API_BASE}/api/${subPath}${search}`;

  // Capture trusted headers BEFORE we filter incoming headers — this is safe
  // because Easy Auth adds them server-side; in production a malicious browser
  // value would be one we discard anyway.
  const easyAuth = readEasyAuthHeaders(req);

  // Build the outbound header set: keep only safe content-type / accept / etc.
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (BLOCKED_INBOUND_HEADERS.has(lk)) return;
    if (BLOCKED_INBOUND_HEADER_PREFIXES.some((p) => lk.startsWith(p))) return;
    headers[key] = value;
  });

  // Re-inject trusted auth context. The API will verify the proxy secret
  // and decode the user identity from X-MS-Client-Principal.
  if (PROXY_SHARED_SECRET) {
    headers['x-proxy-auth'] = PROXY_SHARED_SECRET;
  }
  if (easyAuth.principal) headers['x-ms-client-principal'] = easyAuth.principal;
  if (easyAuth.principalName) headers['x-ms-client-principal-name'] = easyAuth.principalName;
  if (easyAuth.principalId) headers['x-ms-client-principal-id'] = easyAuth.principalId;

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    // @ts-expect-error - duplex required by Node fetch when streaming a body
    duplex: 'half',
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = req.body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: (err as Error).message }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding') return;
    respHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx)    { return proxy(req, await ctx.params); }
export async function POST(req: NextRequest, ctx: Ctx)   { return proxy(req, await ctx.params); }
export async function PUT(req: NextRequest, ctx: Ctx)    { return proxy(req, await ctx.params); }
export async function PATCH(req: NextRequest, ctx: Ctx)  { return proxy(req, await ctx.params); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return proxy(req, await ctx.params); }
export async function OPTIONS(req: NextRequest, ctx: Ctx){ return proxy(req, await ctx.params); }
