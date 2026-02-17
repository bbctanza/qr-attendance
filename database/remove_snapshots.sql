-- Migration: Remove audit_snapshots table
-- Date: 2026-02-17
-- Description: Remove the audit_snapshots table as snapshots are no longer used.
--              Audit restore functionality now reconstructs deleted entities from
--              change_diff data in audit_logs, eliminating the need for snapshots.
--              This simplifies the audit system and reduces storage overhead.

-- Drop the audit_snapshots table if it exists
DROP TABLE IF EXISTS public.audit_snapshots CASCADE;

-- Document: Restore functionality now works as follows:
-- - For UPDATE actions: Uses change_diff to revert changed fields
-- - For DELETE actions: Reconstructs the entity from the last UPDATE's change_diff
--                       (if the entity was updated before deletion)
-- This approach is simpler and requires no additional storage.
