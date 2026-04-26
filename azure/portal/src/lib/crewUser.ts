import { headers } from 'next/headers';

export interface CrewUser {
  oid: string;
  name: string;
  email: string;
}

interface PrincipalClaim { typ?: string; val?: string }
interface Principal {
  claims?: PrincipalClaim[];
  userId?: string;
  userDetails?: string;
}

function pick(p: Principal, types: string[]): string | undefined {
  for (const t of types) {
    const c = p.claims?.find((x) => x.typ === t);
    if (c?.val) return c.val;
  }
  return undefined;
}

/**
 * Reads the user identity from the headers Easy Auth attaches to every
 * authenticated request. Returns `null` for anonymous requests (which
 * shouldn't reach gated pages because middleware redirects them — so
 * this is a defensive `null`, not a regular code path).
 */
export async function getCrewUser(): Promise<CrewUser | null> {
  const h = await headers();
  const principalB64 = h.get('x-ms-client-principal');
  if (!principalB64) return null;

  let parsed: Principal | null = null;
  try {
    const json = Buffer.from(principalB64, 'base64').toString('utf8');
    parsed = JSON.parse(json) as Principal;
  } catch {
    return null;
  }

  const fallbackName = h.get('x-ms-client-principal-name') ?? undefined;
  const fallbackId = h.get('x-ms-client-principal-id') ?? undefined;

  const oid =
    pick(parsed, [
      'http://schemas.microsoft.com/identity/claims/objectidentifier',
      'oid',
      'sub',
    ]) ?? parsed.userId ?? fallbackId ?? '';
  const name =
    pick(parsed, [
      'name',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      'preferred_username',
    ]) ?? parsed.userDetails ?? fallbackName ?? 'Crew';
  const email =
    pick(parsed, [
      'email',
      'preferred_username',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'upn',
    ]) ?? parsed.userDetails ?? '';

  return { oid, name, email };
}
