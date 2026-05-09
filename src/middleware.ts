import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware is kept minimal — auth redirects are handled client-side in
// layout.tsx and individual pages, because the browser Supabase client stores
// sessions in localStorage (not cookies) so the edge middleware can't read them.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$|api/).*)',
  ],
}
