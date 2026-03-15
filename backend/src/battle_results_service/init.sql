-- Battle results table for storing completed battle records
CREATE TABLE IF NOT EXISTS battle_results (
    id BIGSERIAL PRIMARY KEY,
    winner_id VARCHAR(255) NOT NULL,
    loser_id VARCHAR(255),
    room_id VARCHAR(255),
    score VARCHAR(50) DEFAULT '1-0',
    mode VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battle_results_winner ON battle_results(winner_id);
CREATE INDEX IF NOT EXISTS idx_battle_results_created ON battle_results(created_at);
