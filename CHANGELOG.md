# shiPRO Changelog

## [Unreleased] — 2026-05-09

### Task 2: Driver Role Revision
**Goal:** Restrict driver to trip-relevant features only; improve emergency SOS; add real-time location.

#### Added
- `src/app/(dashboard)/today-drive/page.tsx` — new driver-only trip dashboard replacing tracking for drivers; shows assigned job, Google Maps route, GPS auto-capture, real-time location broadcast to fleet managers, status update buttons (accepted/arrived/delivered only)

#### Changed
- `src/lib/permissions.ts` — removed `driver` from `/calendar`; added `/today-drive` as driver-only route
- `src/middleware.ts` — driver accessing `/tracking` now redirects to `/today-drive` instead of `/jobs`
- `src/app/(dashboard)/layout.tsx` — driver nav simplified: Today's Drive replaces Tracking; Calendar removed from driver nav; Emergency and Incidents remain
- `src/app/(dashboard)/emergency/page.tsx` — GPS now auto-captured on mount via `useEffect`; manual GPS button removed from driver view; SOS submits with auto-GPS coords
- `src/app/(dashboard)/tracking/page.tsx` — fleet managers now see real-time driver location markers via Supabase Realtime Broadcast channel `driver-locations`
- `src/app/(dashboard)/fleet/register/page.tsx` — driver role redirected to `/dashboard` on mount
- `src/app/(dashboard)/calendar/page.tsx` — driver role redirected to `/dashboard` on mount

---

## [1.0.0] — 2026-05-08

### Task 1: Role-Based Access Control (RBAC)
**Goal:** Comprehensive RBAC across navigation, routes, actions, and data queries.

#### Added
- `src/lib/permissions.ts` — central permission config: `ROUTE_ALLOWED_ROLES`, `canAccessRoute()`, `canUpdateLoadingStatus()`, `canCreateJobs()`, `canManagePayroll()`, `canApproveApplicants()`, `canManageWarehouses()`, `isAdminOrFleet()`, `LOADING_STATUSES` set
- `src/middleware.ts` — Edge middleware using `@supabase/ssr`; checks session + role from JWT; redirects unauthenticated users to `/login`; redirects wrong-role users to `/dashboard`

#### Changed
- `src/app/(dashboard)/layout.tsx` — nav arrays now have `roles` field; `roleMatch()` helper; filters sidebar + bottom nav by user role
- `src/lib/api.ts` — `fetchJobOrders` accepts `userRole`/`userId`; drivers see only assigned jobs; truck owners see only their trucks' jobs
- `src/app/(dashboard)/jobs/page.tsx` — passes role context to fetch; title changes per role
- `src/app/(dashboard)/tracking/page.tsx` — driver redirected; truck owner filtered
- `src/app/(dashboard)/payroll/page.tsx` — role gates; truck owner sees filtered payslips; warehouse_manager/driver redirected
- `src/app/(dashboard)/incidents/page.tsx` — driver/truck_owner see own incidents only
- `src/app/(dashboard)/warehouse/page.tsx` — driver/truck_owner/client redirected to dashboard
- `src/app/(dashboard)/fleet/page.tsx` — truck owner sees only own trucks/drivers
- `src/app/(dashboard)/jobs/[id]/page.tsx` — loading status gates (`at_pickup`, `loaded`, `in_transit`); warehouse_manager gets Update Status button; driver-allowed statuses filtered in modal

#### Additional fixes (prior commits)
- `fix: payslip owner name, PDF overflow, add inventory/CBM to PDF`
- `fix: unread message badge not clearing after reading messages`
- `fix: chat duplicate messages - properly clean up realtime subscription`
- `feat: add driver and helper to payslip PDF`
