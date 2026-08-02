package game

import (
	"encoding/json"
	"testing"
)

func TestCooldownsJSONKeepsObjectContract(t *testing.T) {
	data, err := json.Marshal(PlayerJSON{
		Cooldowns: CooldownsJSON{Primary: 1.25, Secondary: 0.5},
	})
	if err != nil {
		t.Fatalf("marshal player snapshot: %v", err)
	}

	var decoded struct {
		Cooldowns CooldownsJSON `json:"cooldowns"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode player snapshot: %v", err)
	}
	if decoded.Cooldowns.Primary != 1.25 || decoded.Cooldowns.Secondary != 0.5 {
		t.Fatalf("cooldowns JSON = %#v, want primary/secondary object", decoded.Cooldowns)
	}
}

func TestAbilityCooldownMsKeepsHeroValues(t *testing.T) {
	tests := []struct {
		hero string
		slot string
		want int64
	}{
		{hero: "Needle", slot: "primary", want: 12000},
		{hero: "Viper", slot: "primary", want: 5800},
		{hero: "Titan", slot: "primary", want: 6000},
		{hero: "Spark", slot: "primary", want: 5000},
		{hero: "Unknown", slot: "primary", want: 12000},
		{hero: "Needle", slot: "secondary", want: 6500},
	}
	for _, test := range tests {
		if got := AbilityCooldownMs(test.hero, test.slot); got != test.want {
			t.Errorf("AbilityCooldownMs(%q, %q) = %d, want %d", test.hero, test.slot, got, test.want)
		}
	}
}

func TestGetAttackConfigUsesCatalogValues(t *testing.T) {
	config := GetAttackConfig("Brock Zeus")
	if config.Archetype != AttackProjectile || config.Range != 760 || config.SplashRadius != 72 {
		t.Fatalf("Brock Zeus attack config = %#v, want projectile/760/72", config)
	}
	if unknown := GetAttackConfig("Unknown"); unknown != (AttackConfig{}) {
		t.Fatalf("unknown attack config = %#v, want zero value", unknown)
	}
}
