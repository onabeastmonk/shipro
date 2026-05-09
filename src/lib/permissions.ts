import type { UserRole } from '@/types'

// ── Role groups ─────────────────────────────────────────────

export const ADMIN_ROLES: UserRole[] = ['admin', 'fleet_manager']
export const WAREHOUSE_ROLES: UserRole[] = ['admin', 'fleet_manager', 'warehouse_manager']
export const OWNER_ROLES: UserRole[] = ['admin', 'fleet_manager', 'truck_owner']
export const ALL_ROLES: UserRole[] = ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner', 'driver']

// ── Route access matrix ──────────────────────────────────────
// Maps route prefixes to the roles that may access them.
// The middleware and client guards both reference this.

export const ROUTE_ALLOWED_ROLES: Record<string, UserRole[]> = {
  '/dashboard':        ALL_ROLES,
  '/jobs':             ALL_ROLES,
  '/chat':             ALL_ROLES,
  '/incidents':        ALL_ROLES,
  '/emergency':        ALL_ROLES,
  '/profile':          ALL_ROLES,
  '/calendar':         ALL_ROLES,
  '/tracking':         ['admin', 'fleet_manager', 'warehouse_manager', 'truck_owner'],
  '/payroll':          ['admin', 'fleet_manager', 'truck_owner'],
  '/verification':     ['admin', 'fleet_manager'],
  '/warehouse':        ['admin', 'fleet_manager', 'warehouse_manager'],
  '/fleet':            ['admin', 'fleet_manager', 'truck_owner'],
  '/drivers':          ['truck_owner'],
  '/owner-profile':    ['truck_owner'],
  '/driver-application': ['driver'],
}

// ── Redirect targets by role ─────────────────────────────────

export function getDefaultRoute(role: UserRole): string {
  return '/dashboard'
}

// ── Route guard helper ───────────────────────────────────────

export function canAccessRoute(pathname: string, role: UserRole): boolean {
  // admin and fleet_manager can access everything
  if (role === 'admin' || role === 'fleet_manager') return true

  for (const [prefix, roles] of Object.entries(ROUTE_ALLOWED_ROLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return (roles as UserRole[]).includes(role)
    }
  }
  // Default deny for unknown routes
  return false
}

// ── Action-level permissions ─────────────────────────────────

// Statuses that only fleet_manager/warehouse_manager can transition to
export const LOADING_STATUSES = new Set([
  'at_pickup', 'loaded', 'in_transit',
])

export function canUpdateLoadingStatus(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager' || role === 'warehouse_manager'
}

export function canCreateJobs(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager' || role === 'warehouse_manager'
}

export function canManageVerification(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager'
}

export function canManagePayroll(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager'
}

export function canApproveApplicants(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager'
}

export function canManageWarehouses(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager' || role === 'warehouse_manager'
}

export function isAdminOrFleet(role: UserRole): boolean {
  return role === 'admin' || role === 'fleet_manager'
}
