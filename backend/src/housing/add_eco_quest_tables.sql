-- Eco quest completions: user completes a quest with photo proof
CREATE TABLE IF NOT EXISTS eco_quest_completions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    quest_id VARCHAR(32) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    photo_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_eco_quest_completions_user_date
    ON eco_quest_completions (user_id, completed_at);
