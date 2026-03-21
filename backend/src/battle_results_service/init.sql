CREATE TABLE IF NOT EXISTS battle_results
(
    id BIGSERIAL PRIMARY KEY,
    battle_id VARCHAR(255) NOT NULL UNIQUE,
    players TEXT[] NOT NULL,
    winner_id VARCHAR(255) NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battle_results_winner ON battle_results(winner_id);
CREATE INDEX IF NOT EXISTS idx_battle_results_finished ON battle_results(finished_at);
CREATE INDEX IF NOT EXISTS idx_battle_results_battle_id ON battle_results(battle_id);