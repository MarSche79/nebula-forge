import { headers } from 'next/headers';

const API_BASE = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || '';

/**
 * Server-side fetch helper for React Server Components on auth-gated routes.
 *
 * We DO NOT route through the public `/api/*` proxy because the proxy
 * deliberately strips inbound `x-ms-*` headers (so a malicious browser can't
 * spoof identity) and only re-injects what the Easy Auth sidecar attaches.
 * Easy Auth attaches headers on requests carrying a valid session cookie —
 * server-to-server fetches don't carry the user's cookie, so the proxy would
 * forward an empty principal and the API would return 401.
 *
 * Instead, talk to the internal API FQDN directly and re-create the trust
 * boundary ourselves: present the proxy shared secret + forward the trusted
 * principal headers we received from Easy Auth on the inbound RSC request.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_BASE) throw new Error('API_BASE_URL not configured on the portal container');

  const incoming = await headers();
  const outgoing = new Headers(init.headers);

  // Forward the trusted Easy Auth headers attached to *this* RSC request.
  for (const h of ['x-ms-client-principal', 'x-ms-client-principal-name', 'x-ms-client-principal-id']) {
    const v = incoming.get(h);
    if (v) outgoing.set(h, v);
  }

  // Same shared secret the public proxy uses — proves we're a trusted caller.
  if (PROXY_SHARED_SECRET) outgoing.set('x-proxy-auth', PROXY_SHARED_SECRET);

  if (!outgoing.has('content-type') && init.body && typeof init.body === 'string') {
    outgoing.set('content-type', 'application/json');
  }

  return fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: outgoing,
    cache: 'no-store',
  });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await apiFetch(path, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
