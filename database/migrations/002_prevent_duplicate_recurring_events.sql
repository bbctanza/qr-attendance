-- Remove existing duplicated recurring events before adding constraint
DELETE FROM events WHERE event_id IN (
    SELECT event_id FROM (
        SELECT event_id, ROW_NUMBER() OVER (
            PARTITION BY event_type_id, event_date 
            ORDER BY event_id ASC
        ) as rn 
        FROM events 
        WHERE is_recurring = true
    ) sub WHERE rn > 1
);

-- Ensure atomic recurring event creation via database constraint
CREATE UNIQUE INDEX idx_unique_recurring_event 
ON events (event_type_id, event_date) 
WHERE is_recurring = true;
