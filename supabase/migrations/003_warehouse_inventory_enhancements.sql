-- Warehouse inventory enhancements: status tracking, receiving fields, JO linking

ALTER TABLE warehouse_inventory
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_warehouse'
    CHECK (status IN ('in_warehouse','reserved','loading','loaded','in_transit','delivered','returned','cancelled')),
  ADD COLUMN IF NOT EXISTS date_received date,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3),
  ADD COLUMN IF NOT EXISTS job_order_id uuid REFERENCES job_orders(id) ON DELETE SET NULL;

-- Allow warehouse managers to see their warehouse's inventory (no RLS change needed if already open)
-- Index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_status ON warehouse_inventory(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_job_order ON warehouse_inventory(job_order_id);
