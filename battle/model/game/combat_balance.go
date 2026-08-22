package game

// CombatBalanceRow is the measurable part of the hero balance contract. It is
// intentionally separate from subjective role notes: damage, cadence and range
// can be regenerated from authoritative runtime values.
type CombatBalanceRow struct {
	Hero         string
	Role         string
	AttackType   string
	BasicBurst   int
	BasicDPS     float64
	BasicRange   float64
	MaxHealth    int
	MoveSpeed    int
	AttackRateMs int64
	ReloadMs     int64
	MaxAmmo      int
}

// BuildCombatBalanceMatrix returns one deterministic row for every active hero.
// BasicBurst describes a full ammo load if every projectile/sector hit; it is a
// comparison tool, not a promise that a real fight reaches that value.
func BuildCombatBalanceMatrix() []CombatBalanceRow {
	matrix := make([]CombatBalanceRow, 0, len(Heroes))
	for _, hero := range Heroes {
		hitsPerAttack := hero.Attack.ProjectileCount
		if hitsPerAttack < 1 {
			hitsPerAttack = 1
		}
		burst := hero.AttackDamage * hitsPerAttack * hero.MaxAmmo
		dps := 0.0
		if hero.AttackRate > 0 {
			dps = float64(hero.AttackDamage*hitsPerAttack) * 1000 / float64(hero.AttackRate)
		}
		matrix = append(matrix, CombatBalanceRow{
			Hero:         hero.Name,
			Role:         hero.Role,
			AttackType:   hero.AttackType,
			BasicBurst:   burst,
			BasicDPS:     dps,
			BasicRange:   hero.Attack.Range,
			MaxHealth:    hero.MaxLives,
			MoveSpeed:    hero.Speed,
			AttackRateMs: hero.AttackRate,
			ReloadMs:     hero.ReloadTime,
			MaxAmmo:      hero.MaxAmmo,
		})
	}
	return matrix
}
