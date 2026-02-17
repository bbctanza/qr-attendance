-- ============================================
-- AUDIT SCHEMA FIXES - Run after initial setup
-- ============================================
-- Fixes entity_id type to support string and numeric IDs
-- This allows storing member IDs like "BBCT-9-529" and numeric event IDs

-- 1. First, fix audit_logs table
-- Change entity_id from UUID to TEXT
ALTER TABLE IF EXISTS audit_logs 
  ALTER COLUMN entity_id TYPE TEXT;

-- Add comment for clarity
COMMENT ON COLUMN audit_logs.entity_id IS 'String or numeric entity identifier (member: BBCT-X-X, event: numeric)';

-- 2. Fix audit_snapshots table
-- First drop the unique constraint that depends on the old type
ALTER TABLE IF EXISTS audit_snapshots 
  DROP CONSTRAINT IF EXISTS uq_snapshot_version CASCADE;

-- Change entity_id from UUID to TEXT
ALTER TABLE IF EXISTS audit_snapshots 
  ALTER COLUMN entity_id TYPE TEXT;

-- Re-add the unique constraint
ALTER TABLE audit_snapshots 
  ADD CONSTRAINT uq_snapshot_version 
  UNIQUE(entity_type, entity_id, version_number);

-- Add comment for clarity
COMMENT ON COLUMN audit_snapshots.entity_id IS 'String or numeric entity identifier (member: BBCT-X-X, event: numeric)';

-- 3. Recreate indexes with correct types
DROP INDEX IF EXISTS idx_audit_logs_entity CASCADE;
DROP INDEX IF EXISTS idx_snapshots_entity CASCADE;
DROP INDEX IF EXISTS idx_snapshots_version CASCADE;

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_snapshots_entity ON audit_snapshots(entity_type, entity_id);
CREATE INDEX idx_snapshots_version ON audit_snapshots(entity_type, entity_id, version_number DESC);

-- Verify the changes worked
-- Run this query to confirm:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('audit_logs', 'audit_snapshots') 
-- AND column_name = 'entity_id'
-- ORDER BY table_name;
