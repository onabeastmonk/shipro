# shiPRO — Deployment Guide

Deploy your shiPRO app to the internet so anyone can access it.

---

## Deploy to Vercel (Recommended — Free)

Vercel is made by the same team behind Next.js. It's the easiest way to host shiPRO.

### Step 1 — Push to GitHub

1. Create a GitHub account at https://github.com if you don't have one
2. Create a new repository at https://github.com/new
   - Name: `shipro`
   - Visibility: Private (recommended)
3. In your project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: shiPRO fleet management app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/shipro.git
   git push -u origin main
   ```

### Step 2 — Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **New Project**
3. Find and import your `shipro` repository
4. Vercel will auto-detect Next.js — no configuration needed
5. Before clicking **Deploy**, click **Environment Variables** and add:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `NEXT_PUBLIC_APP_URL` | `https://your-app-name.vercel.app` |

6. Click **Deploy**
7. Wait ~2 minutes for the build to complete
8. Click **Visit** to open your live app! 🎉

### Step 3 — Update your Supabase settings

After deployment, tell Supabase about your new URL:

1. In Supabase, go to **Authentication** → **URL Configuration**
2. Add your Vercel URL to **Redirect URLs**: `https://your-app.vercel.app/**`
3. Update **Site URL** to: `https://your-app.vercel.app`

---

## Update the App

After making code changes:

```bash
git add .
git commit -m "Description of what you changed"
git push
```

Vercel will automatically redeploy — usually in under 2 minutes.

---

## Custom Domain

1. In your Vercel project, go to **Settings** → **Domains**
2. Add your domain (e.g. `fleet.yourcompany.com.ph`)
3. Follow the DNS instructions Vercel provides
4. Update `NEXT_PUBLIC_APP_URL` to your new domain
5. Update Supabase redirect URLs with your new domain

---

## Production Checklist

Before going live:

- [ ] Change all default passwords
- [ ] Create at least one admin account
- [ ] Test the full job order workflow
- [ ] Test truck registration and approval
- [ ] Test payslip generation and PDF download
- [ ] Verify document uploads work
- [ ] Disable Supabase email verification OR set up a real email provider
- [ ] Set up Supabase Auth → Email templates with your branding
- [ ] Enable Supabase **Row Level Security** (it's already in the migration)
- [ ] Review Supabase storage bucket policies
- [ ] Back up your `.env.local` securely (never commit to Git)

---

## Monitoring & Maintenance

- **Supabase Dashboard** — Monitor database usage, API calls, storage
- **Vercel Dashboard** — Monitor deployments, errors, performance
- **Supabase Logs** — View API logs and auth events

### Database backups
Supabase automatically backs up your database. For extra safety:
1. Go to Supabase → **Settings** → **Database**
2. Enable **Point-in-Time Recovery** (paid plans)
   Or manually export: **Database** → **Backups** → **Download**

---

## Environment: Development vs Production

| Setting | Development | Production |
|---|---|---|
| URL | `http://localhost:3000` | `https://your-app.vercel.app` |
| Supabase | Same project is fine | Consider a separate prod project |
| Email | Can disable confirmation | Should use real email provider |
| Debug | Errors shown in browser | Errors logged silently |
