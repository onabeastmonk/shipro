# shiPRO — Task Tracker

## Completed Changes

### Task 1: Role-Based Access Control (RBAC) — DONE ✅
Committed: `feat: implement role-based access control across all pages and navigation`

**Files changed:**
- `src/lib/permissions.ts` — NEW: central permission config, route matrix, action helpers
- `src/middleware.ts` — NEW: server-side route protection via Supabase SSR
- `src/app/(dashboard)/layout.tsx` — role-filtered nav items (sidebar + bottom nav)
- `src/lib/api.ts` — `fetchJobOrders` with role-aware data filtering
- `src/app/(dashboard)/jobs/page.tsx` — passes userRole/userId to fetch, title changes per role
- `src/app/(dashboard)/tracking/page.tsx` — driver redirected; truck owner sees only own truck jobs
- `src/app/(dashboard)/payroll/page.tsx` — truck owner filtered; warehouse_manager/driver redirected
- `src/app/(dashboard)/incidents/page.tsx` — driver/truck_owner see only their own incidents
- `src/app/(dashboard)/warehouse/page.tsx` — driver/truck_owner/client redirected
- `src/app/(dashboard)/fleet/page.tsx` — truck owner sees only own trucks/drivers
- `src/app/(dashboard)/jobs/[id]/page.tsx` — loading status gates, warehouse_manager gets Update Status button

---

### Task 2: Driver Role Revision — DONE ✅

#### Completed sub-tasks:
- [x] Created `PROJECT_CONTEXT.md` and `TASKS.md` for context preservation
- [x] Updated `src/lib/permissions.ts` — removed `driver` from `/calendar`, added `/today-drive` for driver only
- [x] Updated `src/middleware.ts` — driver redirected from `/tracking` → `/today-drive`
- [x] Updated `src/app/(dashboard)/layout.tsx` — driver nav simplified; Today's Drive added, Calendar removed from driver
- [x] Created `src/app/(dashboard)/today-drive/page.tsx` — full driver trip dashboard with auto-GPS, map, status buttons, Supabase Realtime Broadcast
- [x] Updated `src/app/(dashboard)/emergency/page.tsx` — auto-capture GPS on mount, no manual GPS button
- [x] Updated `src/app/(dashboard)/tracking/page.tsx` — fleet manager sees live driver locations via Broadcast subscription
- [x] Added role guard to `src/app/(dashboard)/fleet/register/page.tsx` — driver → redirect to /dashboard
- [x] Added role guard to `src/app/(dashboard)/calendar/page.tsx` — driver → redirect to /dashboard

---

## Pending Tasks

### Nice-to-have (not yet requested):
- [ ] Driver can view their own payslips (read-only) — currently no payslip access for driver
- [ ] Push notifications for emergency alerts (browser Web Push)
- [ ] Offline support / PWA caching for drivers in poor connectivity areas
- [ ] Truck owner analytics dashboard (jobs per truck, revenue per driver)

---

## Known Bugs / Issues
- None at time of last update — all critical bugs from RBAC task were resolved

---

## What Must NOT Be Broken
- Login/auth flow (`/login`, `/register`, Supabase session)
- Supabase connection and realtime subscriptions
- Existing job order creation, status updates, payslip PDF generation
- Chat/messages functionality
- Incident report submission
- Vercel build (`next build` must succeed)
- Payslip PDF generation (jsPDF)
- Google Maps route display on tracking and today-drive pages

---

## Testing Checklist

### Driver Account
- [ ] Cannot register a truck — `/fleet/register` redirects to `/dashboard`
- [ ] Cannot access truck registration by direct URL
- [ ] Cannot see Calendar in nav
- [ ] Cannot access `/calendar` by direct URL — redirects to `/dashboard`
- [ ] Does NOT see full Tracking in nav
- [ ] Accessing `/tracking` redirects to `/today-drive`
- [ ] Sees "Today's Drive" as primary nav item
- [ ] Today's Drive shows assigned job or "No trip today" empty state
- [ ] Map displays pickup → dropoff route for assigned job
- [ ] GPS auto-captured on Today's Drive mount
- [ ] Can update status (accepted, arrived, delivered) via Today's Drive
- [ ] Cannot update loading statuses (at_pickup, loaded, in_transit)
- [ ] Emergency SOS auto-captures GPS on page mount (no separate GPS button needed)
- [ ] Emergency SOS submits with GPS coordinates attached
- [ ] Can submit incident report
- [ ] Can use messages/chat
- [ ] Cannot see payroll, verification, warehouse, inventory, or fleet-wide records
- [ ] Data queries only return their own assigned jobs

### Truck Owner Account
- [ ] Can still register/manage trucks
- [ ] Tracking shows only their own trucks' jobs
- [ ] Cannot see other truck owners' data
- [ ] Payroll shows only their drivers' payslips
- [ ] Calendar still accessible

### Fleet Manager / Admin Account
- [ ] Full tracking map still works
- [ ] Real-time driver location dots appear on tracking map during active trips
- [ ] Emergency alerts received with GPS coordinates
- [ ] Emergency Center shows Google Maps link for driver location
- [ ] Can manage all truck/job/payroll operations as before
- [ ] Calendar accessible

### Warehouse Manager Account
- [ ] Can access tracking, warehouse, jobs
- [ ] Can update loading statuses
- [ ] Cannot access payroll, verification, fleet/register

---

## Next Recommended Tasks (Priority Order)
1. Test all role scenarios end-to-end on mobile (Android Chrome)
2. Verify Supabase Realtime Broadcast works in production (Vercel)
3. Add driver payslip read-only view (they currently can't see their earnings)
4. Add "mark as read" for emergency alerts once resolved notification sent
