ALTER TABLE housing_tasks
ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(32);

ALTER TABLE housing_tickets
ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(32);
