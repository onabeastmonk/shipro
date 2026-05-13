-- ============================================================
-- Migration 004 — Warehouse Manager Assignments
-- Allows Fleet Manager/Admin to assign one or more Warehouse
-- Managers to specific warehouses (many-to-many).
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouse_manager_assignments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID       NOT NULL REFERENCES warehouses(id)  ON DELETE CASCADE,
  manager_id   UUID       NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  assigned_by  UUID       REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, manager_id)
);

CREATE INDEX IF NOT EXISTS idx_wma_warehouse ON warehouse_manager_assignments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wma_manager   ON warehouse_manager_assignments(manager_id);

-- RLS: only admin/fleet_manager may write; authenticated users may read their own rows
ALTER TABLE warehouse_manager_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet/Admin manage WM assignments" ON warehouse_manager_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','fleet_manager'))
  );

CREATE POLICY "WM reads own assignments" ON warehouse_manager_assignments
  FOR SELECT USING (manager_id = auth.uid());

SELECT 'Migration 004 complete — warehouse_manager_assignments created' AS status;
