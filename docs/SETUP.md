# shiPRO — Setup Guide

**A complete fleet management & logistics platform.**
Built with Next.js 14, Supabase, and Tailwind CSS.

---

## What You'll Need

| Tool | Where to get it |
|---|---|
| Node.js 18+ | https://nodejs.org |
| A Supabase account (free) | https://supabase.com |
| A Vercel account (free, for hosting) | https://vercel.com |
| Git | https://git-scm.com |

---

## Step 1 — Set Up Supabase

### 1a. Create a new project

1. Go to https://supabase.com and sign in
2. Click **New Project**
3. Choose your organization, pick a project name like `shipro`
4. Set a strong database password (save this somewhere safe)
5. Choose a region close to the Philippines (Singapore or Tokyo)
6. Click **Create new project** and wait ~2 minutes

### 1b. Run the database migration

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `/supabase/migrations/001_initial_schema.sql` from this project
4. Copy the entire contents and paste it into the SQL editor
5. Click **Run** (or press Cmd+Enter / Ctrl+Enter)
6. You should see "Success. No rows returned." — that means it worked!

### 1c. Create the storage bucket

1. In your Supabase project, click **Storage** in the left sidebar
2. Click **New bucket**
3. Name it exactly: `shipro-documents`
4. Check **Public bucket** (so files can be accessed via URL)
5. Click **Save**

### 1d. Get your API keys

1. In your Supabase project, go to **Settings** → **API**
2. Copy these three values — you'll need them soon:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   - **service_role** key (another long string — keep this secret!)

---

## Step 2 — Install the App Locally

Open your Terminal (Mac/Linux) or Command Prompt (Windows) and run:

```bash
# 1. Navigate to the project folder
cd shipro

# 2. Install all dependencies (this may take 1-2 minutes)
npm install

# 3. Create your environment file
cp .env.local.example .env.local
```

Now open `.env.local` in any text editor and fill in your Supabase values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 3 — Create the First Admin Account

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open http://localhost:3000 in your browser
3. Click **Register**
4. Select **Fleet Manager / Admin** as your account type
5. Fill in your name, email, and password
6. Click **Create Account**

> **Note:** Supabase may ask you to verify your email. Check your inbox and click the confirmation link.

After registering, your profile is automatically created. To grant yourself admin access:

1. In Supabase, go to **Table Editor** → `profiles`
2. Find your row (by email)
3. Click the row, change `role` to `admin` and `is_verified` to `true`
4. Click **Save**

---

## Step 4 — Start Using shiPRO

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 and log in. You'll see the dashboard!

### First things to do:

1. **Register a truck** → Go to Fleet → Register Truck
2. **Create a job order** → Go to Jobs → New Order
3. **Approve the truck** → Go to Fleet → Pending Review → Approve

---

## Project Structure

```
shipro/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, Register pages
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/     # All main app pages
│   │   │   ├── dashboard/   # Main overview
│   │   │   ├── jobs/        # Job orders list + detail + new
│   │   │   ├── fleet/       # Trucks + drivers + documents
│   │   │   ├── tracking/    # Live delivery monitoring
│   │   │   ├── payroll/     # Driver payslips
│   │   │   └── profile/     # User settings + notifications
│   │   └── api/             # REST API endpoints
│   ├── lib/
│   │   ├── supabase.ts      # Database client
│   │   ├── auth.ts          # Authentication helpers
│   │   ├── api.ts           # Data fetching functions
│   │   └── utils.ts         # Formatting + PDF generation
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript type definitions
│   └── styles/              # Global CSS
├── supabase/
│   └── migrations/          # Database schema SQL
├── public/                  # Static files + PWA manifest
└── docs/                    # This documentation
```

---

## User Roles

| Role | What they can do |
|---|---|
| **Admin** | Full access: manage jobs, approve trucks, generate payslips, view all data |
| **Warehouse / Dispatcher** | Create and manage job orders, dispatch drivers |
| **Driver / Trucker** | View available jobs, apply, update delivery status |
| **Client** | View tracking status of their deliveries |

---

## Features

- ✅ Job Orders — Create, assign, and track deliveries with full status workflow
- ✅ Fleet Management — Register trucks, manage documents, approve/reject applicants
- ✅ Live Tracking — Monitor deliveries with progress tracking (GPS-ready)
- ✅ Payroll — Generate payslips with PDF export for drivers
- ✅ Notifications — Real-time alerts for status changes and document expiry
- ✅ Document Monitoring — Track OR/CR, LTFRB, Insurance expiry dates
- ✅ Mobile-First — Full PWA support, installable on phones
- ✅ Multi-role Access — Admin, Driver, Warehouse, Client roles
- ✅ Activity Audit Trail — Full log of all system actions
- ✅ CSV Export — Export payroll and job data

---

## Common Issues

**"Missing Supabase environment variables" error**
→ Make sure `.env.local` exists and has the correct values. Restart `npm run dev` after editing.

**"Failed to create job order" or similar errors**
→ Check that you ran the SQL migration file. Open Supabase Table Editor to verify tables exist.

**Files not uploading**
→ Make sure you created the `shipro-documents` storage bucket and set it to Public.

**Login not working after registration**
→ Supabase may require email verification. Check your inbox, or disable email confirmation in Supabase Auth settings (Authentication → Providers → Email → uncheck "Confirm email").

**Page shows blank / crashes**
→ Open browser DevTools (F12) → Console tab to see the specific error.

---

## Customizing the App

### Change the company name
Edit `src/app/layout.tsx` — update the `<title>` and meta description.
For PDF documents, edit the `generatePayslipPDF` function in `src/lib/utils.ts`.

### Add your logo
Drop your logo file in the `/public` folder, then update the sidebar in `src/app/(dashboard)/layout.tsx`.

### Change colors
Edit `tailwind.config.ts` — the color palette is defined there under `theme.extend.colors`.

---

## Next Steps (Advanced)

- **GPS Integration** — The tracking map is ready for a GPS provider like Google Maps Platform or Waze for Cities
- **SMS Notifications** — Add Twilio or Semaphore (PH) for SMS alerts to drivers/clients
- **Push Notifications** — The PWA manifest is set up; add a service worker for push notifications
- **Mobile App** — Convert to React Native (Expo) using the same Supabase backend
- **Reports** — Add recharts dashboards for revenue, delivery performance, driver metrics
