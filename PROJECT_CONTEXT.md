# shiPRO — Project Context

## Project Overview
shiPRO is a fleet management and logistics operations platform for the Philippines market. It handles job order management, truck/driver assignment, delivery tracking, payroll, warehouse inventory, and emergency response. Built for multi-tenant usage with 5 distinct user roles.

---

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom CSS variables (dark theme)
- **Database**: Supabase (Postgres + Row Level Security)
- **Auth**: Supabase Auth (`@supabase/ssr` v0.3.0 for SSR/middleware)
- **Realtime**: Supabase Realtime (Postgres Changes + Broadcast channels)
- **Maps**: Google Maps JavaScript API (geocoding, directions, markers)
- **PDF**: jsPDF + jspdf-autotable (payslips)
- **Charts**: Recharts
- **UI primitives**: lucide-react, react-hot-toast, react-hook-form + zod, clsx/tailwind-merge
- **State**: React `useState`/`useEffect` (no global state library)

---

## Deployment
- **Hosting**: Vercel
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Do NOT break `next build` or Vercel deployment config
- No Docker, no custom server

---

## Authentication / Login
- Supabase Auth with email + password
- Role is stored in `user.user_metadata.role` (set at registration, never changes)
- Available in JWT — middleware reads it without an extra DB call
- Session managed via `@supabase/ssr` + cookies
- Login page: `/login` | Register: `/register`
- After login → `/dashboard`
- Middleware (`src/middleware.ts`) runs on Edge, protects all routes

---

## Supabase / Database Tables (key ones)
| Table | Purpose |
|---|---|
| `profiles` | User profiles, mirrors auth.users, has `role` column |
| `trucks` | Truck records, `owner_id` = truck owner's user ID |
| `job_orders` | Delivery jobs, has `assigned_driver_id`, `assigned_truck_id`, `status` |
| `delivery_status_logs` | Status change history per job |
| `job_applications` | Driver applications to open jobs |
| `payslips` | Driver payslip records |
| `incident_reports` | Incident submissions |
| `emergency_alerts` | SOS alerts from drivers, `reported_by` = user ID |
| `messages` | Chat messages, `receiver_id` for filtering |
| `notifications` | In-app notifications per user |
| `inventory_items` | Warehouse inventory |
| `warehouses` | Warehouse locations |
| `calendar_events` | Fleet calendar entries |

---

## User Roles
| Role | Description |
|---|---|
| `admin` | Full access to everything |
| `fleet_manager` | Same as admin for most features |
| `warehouse_manager` | Warehouse, jobs (loading statuses), incidents |
| `truck_owner` | Their own trucks, drivers, jobs, payroll (filtered) |
| `driver` | Their assigned jobs only; Today's Drive, incidents, emergency, messages |

---

## Current Navigation Structure

### Sidebar (desktop) + Bottom Nav (mobile) — role-filtered
All nav items are defined in `src/app/(dashboard)/layout.tsx` in `ALL_NAV_ITEMS` array.

**Admin / Fleet Manager** — full access:
- Dashboard, Jobs, Tracking, Fleet, Payroll, Warehouse, Verification, Messages, Calendar, Incidents, Emergency

**Warehouse Manager**:
- Dashboard, Jobs, Tracking, Warehouse, Messages, Calendar, Incidents, Emergency

**Truck Owner**:
- Dashboard, Jobs, Tracking, Fleet, Payroll, My Team, My Drivers, Messages, Calendar, Incidents, Emergency

**Driver** (after Task 2 revision):
- Today's Drive, My Jobs, Incidents, Emergency, Messages, Profile
- Does NOT see: Tracking, Fleet/Truck Registration, Calendar, Payroll, Verification, Warehouse

---

## Pages / Features

| Route | Page | Roles |
|---|---|---|
| `/dashboard` | Dashboard overview | All |
| `/jobs` | Job orders list | All (data filtered by role) |
| `/jobs/[id]` | Job detail, status updates | All (actions filtered) |
| `/today-drive` | Driver trip dashboard | Driver only |
| `/tracking` | Fleet tracking map | Admin, Fleet Manager, Warehouse Manager, Truck Owner |
| `/fleet` | Truck management | Admin, Fleet Manager, Truck Owner |
| `/fleet/register` | Register new truck | Admin, Fleet Manager, Truck Owner (NOT Driver) |
| `/payroll` | Payslip management | Admin, Fleet Manager, Truck Owner |
| `/warehouse` | Warehouse/inventory | Admin, Fleet Manager, Warehouse Manager |
| `/verification` | Document verification | Admin, Fleet Manager |
| `/calendar` | Fleet calendar | Admin, Fleet Manager, Warehouse Manager, Truck Owner (NOT Driver) |
| `/incidents` | Incident reports | All (data filtered) |
| `/emergency` | Emergency SOS | All |
| `/chat` | Messages | All |
| `/profile` | User profile | All |
| `/drivers` | Truck owner's drivers | Truck Owner |
| `/owner-profile` | Truck owner team | Truck Owner |
| `/driver-application` | Driver job applications | Driver |

---

## Role Permissions — Central Config
**File**: `src/lib/permissions.ts`

Key permission functions:
- `canAccessRoute(pathname, role)` — used by middleware + client guards
- `canUpdateLoadingStatus(role)` — loading/transit statuses (admin, fleet_manager, warehouse_manager only)
- `canCreateJobs(role)` — admin, fleet_manager, warehouse_manager
- `canManagePayroll(role)` — admin, fleet_manager
- `canApproveApplicants(role)` — admin, fleet_manager
- `canManageWarehouses(role)` — admin, fleet_manager, warehouse_manager
- `isAdminOrFleet(role)` — admin, fleet_manager

**Driver-allowed job statuses**: `accepted`, `arrived`, `delivered`
**Loading statuses** (fleet/warehouse only): `at_pickup`, `loaded`, `in_transit`

---

## Important Workflows

### Job Order Lifecycle
`draft` → `posted` → `open_for_applications` → `pending_selection` → `assigned` → `accepted` → `at_pickup` → `loaded` → `in_transit` → `arrived` → `delivered` → `completed`

### Driver Assignment Flow
1. Fleet manager creates job order
2. Job posted → drivers apply via `/driver-application`
3. Fleet manager selects driver → job `assigned`
4. Driver accepts → `accepted`
5. Driver updates through trip statuses
6. Delivered → payslip generated

### Emergency SOS Flow (after Task 2)
1. Driver opens Emergency page → GPS auto-captured on mount
2. Driver holds SOS button 3 seconds
3. Alert saved with GPS coords, job ID, driver info
4. Incident report auto-created
5. All admins/fleet managers notified
6. Emergency visible on fleet manager's Emergency Center

### Real-time Driver Location (Today's Drive)
- Uses Supabase Realtime Broadcast channel `driver-locations`
- Driver broadcasts position every 5 seconds during active trip
- Fleet managers subscribe to channel and see driver dots on tracking map
- Ephemeral — no DB table, no persistent history

---

## Development Rules
1. Do NOT rebuild the whole system unless explicitly instructed
2. Do NOT break existing login/authentication
3. Do NOT break Supabase connection
4. Do NOT break Vercel deployment
5. Do NOT remove working features unless specifically requested
6. Always protect permissions at: navigation, route, action, AND data-query level
7. Do NOT only hide UI — also prevent direct URL access and unauthorized data fetching
8. Keep mobile browser usability in mind (Android Chrome primary)
9. After each revision, update PROJECT_CONTEXT.md and TASKS.md

---

## Current Driver-Side Behavior (after Task 2)
- Sees: Today's Drive, My Jobs, Incidents, Emergency, Messages, Profile
- Today's Drive shows assigned job for today with map, status buttons, GPS
- Emergency SOS auto-captures GPS on page mount
- Real-time location broadcast to fleet managers during active trip
- Cannot access: /fleet/register, /calendar, /tracking, /payroll, /warehouse, /verification
- Middleware redirects driver from /tracking → /today-drive
- All data queries filtered by `assigned_driver_id = currentUser.id`

## Current Truck Owner Behavior
- Sees: Dashboard, Jobs, Fleet (own trucks only), Payroll (own drivers only), My Team, My Drivers, Messages, Calendar, Incidents, Emergency
- Truck data filtered: `.eq('owner_id', userId)`
- Job data filtered: jobs assigned to their trucks
- Cannot see other owners' data

## Current Warehouse Manager Behavior
- Sees: Dashboard, Jobs, Tracking, Warehouse, Messages, Calendar, Incidents, Emergency
- Can update loading statuses (`at_pickup`, `loaded`, `in_transit`)
- Cannot manage payroll or verification

## Current Fleet Manager / Admin Behavior
- Full access to all features
- Sees real-time driver locations on tracking map (via Broadcast channel)
- Receives emergency alerts with GPS and driver info
- Can manage all trucks, drivers, jobs, payroll, verification, warehouses
