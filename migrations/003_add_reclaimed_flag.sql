-- ============================================================================
-- Migration 003: Add reclaimed flag to budgets table
-- ============================================================================
-- Purpose: Prevent double budget reclamation (manual + automatic trigger)
-- Issue: https://github.com/anthropics/multi-agent-builder/issues/1
-- Date: 2024-01-24
-- ============================================================================

-- UP Migration
-- ============================================================================

-- Add reclaimed flag to track if budget was manually reclaimed
ALTER TABLE budgets
ADD COLUMN reclaimed BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX idx_budgets_reclaimed ON budgets(reclaimed);

-- Update the reclaim trigger to check the flag
CREATE OR REPLACE FUNCTION reclaim_child_budget()
RETURNS TRIGGER AS $$
DECLARE
  parent_agent_id UUID;
  child_allocated INTEGER;
  child_used INTEGER;
  unused_budget INTEGER;
  already_reclaimed BOOLEAN;
BEGIN
  -- Only process when agent transitions to terminal state
  IF NEW.status IN ('completed', 'failed', 'terminated') AND
     OLD.status NOT IN ('completed', 'failed', 'terminated') THEN

    -- Get parent agent ID
    SELECT parent_id INTO parent_agent_id
    FROM agents
    WHERE id = NEW.id;

    -- If this agent has a parent, reclaim unused budget
    IF parent_agent_id IS NOT NULL THEN
      -- Check if budget was already manually reclaimed
      SELECT reclaimed INTO already_reclaimed
      FROM budgets
      WHERE agent_id = NEW.id;

      -- Only reclaim if not already done manually
      IF NOT already_reclaimed THEN
        -- Get child's budget allocation and usage
        SELECT allocated, used INTO child_allocated, child_used
        FROM budgets
        WHERE agent_id = NEW.id;

        -- Calculate unused budget (allocated - used)
        unused_budget := child_allocated - child_used;

        -- Return unused budget to parent by reducing reserved amount
        UPDATE budgets
        SET reserved = reserved - child_allocated + child_used,
            updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = parent_agent_id;

        -- Mark as reclaimed
        UPDATE budgets
        SET reclaimed = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (drop and create to apply new function)
DROP TRIGGER IF EXISTS trigger_reclaim_child_budget ON agents;

CREATE TRIGGER trigger_reclaim_child_budget
AFTER UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION reclaim_child_budget();

-- ============================================================================
-- DOWN Migration
-- ============================================================================

-- Restore original trigger function (without reclaimed check)
-- CREATE OR REPLACE FUNCTION reclaim_child_budget()
-- RETURNS TRIGGER AS $$
-- DECLARE
--   parent_agent_id UUID;
--   child_allocated INTEGER;
--   child_used INTEGER;
--   unused_budget INTEGER;
-- BEGIN
--   IF NEW.status IN ('completed', 'failed', 'terminated') AND
--      OLD.status NOT IN ('completed', 'failed', 'terminated') THEN
--     SELECT parent_id INTO parent_agent_id FROM agents WHERE id = NEW.id;
--     IF parent_agent_id IS NOT NULL THEN
--       SELECT allocated, used INTO child_allocated, child_used
--       FROM budgets WHERE agent_id = NEW.id;
--       unused_budget := child_allocated - child_used;
--       UPDATE budgets
--       SET reserved = reserved - child_allocated + child_used,
--           updated_at = CURRENT_TIMESTAMP
--       WHERE agent_id = parent_agent_id;
--     END IF;
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP INDEX idx_budgets_reclaimed;
-- ALTER TABLE budgets DROP COLUMN reclaimed;
