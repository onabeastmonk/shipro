# shiPRO — Fleet Management & Logistics Platform

> Professional fleet management, job order dispatching, live tracking, and payroll for modern logistics companies.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Database-green?style=flat-square&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwind-css)

---

## Features

| Module | Description |
|---|---|
| 📋 **Job Orders** | Create, assign, and track deliveries with full 11-step status workflow |
| 🚛 **Fleet Management** | Register trucks, manage 27 truck types, approve/reject applications |
| 📡 **Live Tracking** | Monitor active deliveries with GPS-ready map interface |
| 💰 **Payroll** | Generate driver payslips with PDF export and CSV download |
| 📄 **Document Monitoring** | Track OR/CR, LTFRB, Insurance expiry — alerts before expiry |
| 🔔 **Notifications** | Real-time system notifications for all users |
| 👥 **Multi-role Access** | Admin, Driver, Warehouse Dispatcher, Client roles |
| 📱 **Mobile-First PWA** | Installable on Android/iOS, works offline |
| 📊 **Dashboard** | Stats overview with job status distribution |
| 🔍 **Audit Trail** | Full activity log for compliance |

---

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Run locally
npm run dev
```

Open http://localhost:3000

**Full setup guide:** [docs/SETUP.md](docs/SETUP.md)
**Deployment guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS with dark-mode-first design system
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Auth:** Supabase Auth (email/password)
- **Storage:** Supabase Storage (truck documents, proof of delivery)
- **PDF:** jsPDF + jspdf-autotable (client-side payslip generation)
- **Hosting:** Vercel (recommended)

---

## Architecture

```
Browser (Next.js App)
        │
        ├─── Supabase Client (real-time DB, auth)
        ├─── Next.js API Routes (server-side operations)
        └─── Supabase Storage (file uploads)
                │
                └─── PostgreSQL DB (Supabase)
                      ├── profiles (users)
                      ├── trucks + truck_documents
                      ├── job_orders + shipment_items
                      ├── job_applicants
                      ├── delivery_status_logs
                      ├── payslips
                      ├── notifications
                      └── activity_logs
```

---

## User Roles

- **Admin** — Full system access
- **Warehouse/Dispatcher** — Create and manage job orders
- **Driver/Trucker** — View jobs, apply, update delivery status
- **Client** — View tracking only

---

## License

Private — shiPRO Fleet Management System
Built for logistics operations in the Philippines 🇵🇭
