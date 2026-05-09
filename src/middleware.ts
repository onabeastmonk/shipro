import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types'
import { canAccessRoute } from '@/lib/permissions'

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/register', '/reset-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Build a mutable response so Supabase can refresh the session cookie
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // ── Not authenticated ─────────────────────────────────────
  if (!session) {
    if (isPublic) return response
    // Redirect to login, preserving the intended URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Authenticated — redirect away from public pages ───────
  if (isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Role-based route protection ───────────────────────────
  // The role is stored in user_metadata (set at sign-up) and is
  // reliable for this app since roles don't change post-registration.
  const role = (session.user.user_metadata?.role ?? 'driver') as UserRole

  if (!canAccessRoute(pathname, role)) {
    // Driver going to /tracking or /today-drive → redirect to My Trips
    if (role === 'driver' && (pathname.startsWith('/tracking') || pathname.startsWith('/today-drive'))) {
      return NextResponse.redirect(new URL('/my-trips', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, site icons
     * - public assets (images, fonts, etc.)
     * - API routes (handled by their own auth checks)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$|api/).*)',
  ],
}
