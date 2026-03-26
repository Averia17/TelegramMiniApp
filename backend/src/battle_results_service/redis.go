package main

import (
	"battle_results/models"
	"context"

	"github.com/redis/go-redis/v9"
)

var updateBattleScoresLua = redis.NewScript(`
    local leaderboard_key = KEYS[1]
    local battle_id = ARGV[1]
    local winner_id = ARGV[2]
    
    -- Проверяем и обновляем каждого участника
    for i = 2, #ARGV do
        local player_id = ARGV[i]
        local is_winner = (player_id == winner_id)
        
        -- Ключ для проверки дубликатов (храним ID последнего боя игрока)
        local last_battle_key = "last_battle:" .. player_id
        local last_id = redis.call("GET", last_battle_key)

        -- Если этот бой еще не обрабатывался для этого игрока
        if last_id ~= battle_id then
            local change = is_winner and 20 or -10
            local current = tonumber(redis.call("ZSCORE", leaderboard_key, player_id) or "0")
            local new_score = current + change
            
            if new_score < 0 then new_score = 0 end
            
            redis.call("ZADD", leaderboard_key, new_score, player_id)
            -- Запоминаем ID боя для этого игрока (ставим TTL 24 часа, чтобы не копить мусор)
            redis.call("SETEX", last_battle_key, 86400, battle_id)
        end
    end
    return true
`)

const leaderboardKey = "leaderboard"

func updateScore(ctx context.Context, rdb *redis.Client, batch []*models.BattleResult) error {
	pipe := rdb.Pipeline()

	for _, res := range batch {
		args := make([]interface{}, 0, len(res.Players)+2)
		args = append(args, res.BattleID, res.WinnerID)

		for _, pID := range res.Players {
			args = append(args, pID)
		}

		updateBattleScoresLua.Run(ctx, pipe, []string{leaderboardKey}, args...)
	}

	_, err := pipe.Exec(ctx)
	return err
}

func getLeaderboard(ctx context.Context, rdb *redis.Client) ([]redis.Z, error) {
	cmd := rdb.ZRevRangeWithScores(ctx, leaderboardKey, 0, 99)

	if err := cmd.Err(); err != nil {
		return nil, err
	}

	return cmd.Val(), nil
}
