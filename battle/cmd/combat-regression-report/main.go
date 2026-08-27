package main

import (
	"battle/model/game"
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	report, err := game.BuildCombatRegressionReport()
	if err != nil {
		fmt.Fprintf(os.Stderr, "combat regression report: %v\n", err)
		os.Exit(1)
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode combat regression report: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}
