-- ============================================================
-- shiPRO - Complete Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  company_name TEXT,
  contact_number TEXT,
  role TEXT NOT NULL DEFAULT 'driver' CHECK (role IN ('admin','driver','warehouse','client')),
  is_verified BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- TRUCKS & FLEET
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trucks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  owner_name TEXT NOT NULL,
  business_name TEXT,
  contact_person TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_contact TEXT NOT NULL,
  plate_number TEXT NOT NULL UNIQUE,
  truck_type TEXT NOT NULL,
  truck_type_label TEXT NOT NULL,
  cbm_capacity DECIMAL(10,2) NOT NULL DEFAULT 0,
  load_capacity_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  ltfrb_number TEXT,
  availability TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','on_job','under_maintenance','inactive')),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','for_review','approved','rejected','expired')),
  admin_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS truck_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size_kb INTEGER,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('valid','expiring_soon','expired','pending_upload')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- JOB ORDERS
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS job_order_seq START 1000;

CREATE TABLE IF NOT EXISTS job_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT NOT NULL UNIQUE DEFAULT ('JO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('job_order_seq')::TEXT, 4, '0')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  client_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  shipment_category TEXT NOT NULL DEFAULT 'appliances'
    CHECK (shipment_category IN ('appliances','electronics','furniture','general_cargo','others')),
  goods_description TEXT,
  total_cbm DECIMAL(10,2),
  estimated_weight_kg DECIMAL(10,2),
  required_truck_type TEXT,
  required_truck_type_label TEXT,
  delivery_date DATE NOT NULL,
  delivery_time TIME,
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','pending_assignment','assigned','accepted','at_pickup','loaded','in_transit','arrived','delivered','completed','cancelled')),
  assigned_truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  assigned_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  base_rate DECIMAL(12,2),
  other_charges DECIMAL(12,2) DEFAULT 0,
  total_rate DECIMAL(12,2),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  cbm_per_item DECIMAL(10,4),
  total_cbm DECIMAL(10,4),
  is_fragile BOOLEAN DEFAULT false,
  requires_special_handling BOOLEAN DEFAULT false,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  message TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_order_id, truck_id)
);

CREATE TABLE IF NOT EXISTS delivery_status_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  location TEXT,
  proof_url TEXT,
  proof_filename TEXT,
  logged_by UUID REFERENCES profiles(id),
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- PAYSLIPS
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS payslip_seq START 1;

CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payslip_number TEXT NOT NULL UNIQUE DEFAULT ('PS-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('payslip_seq')::TEXT, 4, '0')),
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  job_order_id UUID REFERENCES job_orders(id) ON DELETE SET NULL,
  delivery_date DATE NOT NULL,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  truck_type_label TEXT NOT NULL,
  base_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  additional_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_allowance DECIMAL(12,2) NOT NULL DEFAULT 0,
  toll_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  parking_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','processing','paid')),
  date_paid DATE,
  remarks TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info'
    CHECK (type IN ('info','warning','success','error')),
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- ACTIVITY LOGS (Audit Trail)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SYSTEM SETTINGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('company_name', 'shiPRO Logistics Corp.', 'Company name for documents'),
  ('company_address', 'Pasig City, Metro Manila', 'Company address'),
  ('company_contact', '+63 2 8XXX XXXX', 'Company contact number'),
  ('document_expiry_warning_days', '30', 'Days before expiry to show warning'),
  ('allow_driver_registration', 'true', 'Allow new driver registrations')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- INDEXES for performance
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_job_orders_status ON job_orders(status);
CREATE INDEX IF NOT EXISTS idx_job_orders_created_by ON job_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_delivery_date ON job_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_job_orders_assigned_truck ON job_orders(assigned_truck_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_job ON job_applicants(job_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_job ON delivery_status_logs(job_order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_trucks_verification ON trucks(verification_status);
CREATE INDEX IF NOT EXISTS idx_truck_docs_expiry ON truck_documents(expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_payslips_driver ON payslips(driver_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users see their own, admins see all
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Job orders: all authenticated users can view, only admins create
CREATE POLICY "Authenticated users view job orders" ON job_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage job orders" ON job_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','warehouse'))
);

-- Trucks: owners view their own, admins view all
CREATE POLICY "Truck owners view own trucks" ON trucks FOR SELECT USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','warehouse'))
);
CREATE POLICY "Users can register trucks" ON trucks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage trucks" ON trucks FOR UPDATE USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications: users see own
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Payslips: drivers see own, admins see all
CREATE POLICY "Drivers view own payslips" ON payslips FOR SELECT USING (
  driver_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins manage payslips" ON payslips FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON trucks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_job_orders_updated_at BEFORE UPDATE ON job_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payslips_updated_at BEFORE UPDATE ON payslips FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Calculate total rate on job order save
CREATE OR REPLACE FUNCTION calculate_total_rate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_rate = COALESCE(NEW.base_rate, 0) + COALESCE(NEW.other_charges, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_job_order_total BEFORE INSERT OR UPDATE ON job_orders FOR EACH ROW EXECUTE FUNCTION calculate_total_rate();

-- Update document status based on expiry date
CREATE OR REPLACE FUNCTION refresh_document_statuses()
RETURNS VOID AS $$
DECLARE
  warning_days INTEGER;
BEGIN
  SELECT value::INTEGER INTO warning_days FROM system_settings WHERE key = 'document_expiry_warning_days';
  warning_days := COALESCE(warning_days, 30);

  UPDATE truck_documents SET status = CASE
    WHEN file_url IS NULL THEN 'pending_upload'
    WHEN expiry_date < CURRENT_DATE THEN 'expired'
    WHEN expiry_date < CURRENT_DATE + (warning_days || ' days')::INTERVAL THEN 'expiring_soon'
    ELSE 'valid'
  END
  WHERE expiry_date IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- SEED DATA (Sample data for development)
-- ─────────────────────────────────────────────────────────────

-- Note: In production, remove this seed data section.
-- Create admin user via Supabase Auth dashboard first, then run:
-- INSERT INTO profiles (id, email, full_name, role, is_verified)
-- VALUES ('<your-auth-user-id>', 'admin@shipro.ph', 'Fleet Manager', 'admin', true);
