-- ============================================================
-- shiPRO Migration 002 — Driver Application Workflow
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Update job_orders status to include new statuses
ALTER TABLE job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
ALTER TABLE job_orders ADD CONSTRAINT job_orders_status_check
  CHECK (status IN (
    'draft','posted','open_for_applications','pending_selection',
    'assigned','accepted','at_pickup','loaded','in_transit',
    'arrived','delivered','completed','cancelled'
  ));

-- 2. Update job_applicants with new columns
ALTER TABLE job_applicants
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_remarks TEXT,
  ADD COLUMN IF NOT EXISTS date_applied TIMESTAMPTZ DEFAULT NOW();

-- Update applicant status check
ALTER TABLE job_applicants DROP CONSTRAINT IF EXISTS job_applicants_status_check;
ALTER TABLE job_applicants ADD CONSTRAINT job_applicants_status_check
  CHECK (status IN ('pending','approved','rejected','withdrawn'));

-- 3. Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_applicants_driver ON job_applicants(driver_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_status ON job_applicants(status);

SELECT 'Migration 002 complete' as status;
