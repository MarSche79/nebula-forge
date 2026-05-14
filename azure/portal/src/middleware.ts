import { NextResponse, type NextRequest } from 'next/server';

// Routes that require an authenticated crew member.
const PROTECTED_PATHS = [
  '/command-center',
  '/dashboard',
  '/agents-board',
  '/hr',
];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const protectedHit = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!protectedHit) return NextResponse.next();

  // Easy Auth, when enabled, attaches X-MS-Client-Principal on every request
  // it lets through. If the header is missing, the user isn't signed in —
  // bounce them to the AAD login flow with a return URL.
  const principal = req.headers.get('x-ms-client-principal');
  if (principal) return NextResponse.next();

  // Build the post-login redirect URI relative to the current host.
  const returnTo = pathname + (req.nextUrl.search || '');
  const loginUrl = new URL('/.auth/login/aad', req.url);
  loginUrl.searchParams.set('post_login_redirect_uri', returnTo);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/command-center/:path*', '/dashboard/:path*', '/agents-board/:path*', '/hr/:path*'],
};
