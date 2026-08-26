package main

import (
	"battle/model/game"
	"battle/model/gamemap"
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	mapValue := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleSeed)
	report, err := game.BuildResourceTopologyReport("team-battle", mapValue)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}
