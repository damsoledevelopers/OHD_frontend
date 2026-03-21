import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Legacy broken links when app base incorrectly ended with `/companies` and `/start` was appended. */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/companies/start') {
    const url = request.nextUrl.clone();
    url.pathname = '/survey/start';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/companies/start',
};
