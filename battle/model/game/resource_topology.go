package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

// ResourceRouteSample is one deterministic navigation measurement from a
// team spawn to a neutral or dropped resource. Travel time uses the current
// runtime movement contract of a mid-speed hero (14 compact speed units).
// Keeping the probe speed fixed makes p50/p90 useful for map comparisons.
type ResourceRouteSample struct {
	Team       string  `json:"team"`
	OriginID   string  `json:"originId"`
	ResourceID string  `json:"resourceId"`
	DistancePx float64 `json:"distancePx"`
	TravelMs   int64   `json:"travelMs"`
	Reachable  bool    `json:"reachable"`
}

// ResourceContestSample compares the first arrival from both teams to one
// neutral camp. A small arrival delta means the camp is contestable rather
// than silently owned by one side from the opening spawn.
type ResourceContestSample struct {
	ResourceID    string `json:"resourceId"`
	BlueArrivalMs int64  `json:"blueArrivalMs"`
	RedArrivalMs  int64  `json:"redArrivalMs"`
	ContestTimeMs int64  `json:"contestTimeMs"`
	WindowMs      int64  `json:"windowMs"`
	Contested     bool   `json:"contested"`
}

// ResourceTopologyReport is a deterministic map-side pacing artifact. It is
// intentionally independent of live telemetry: CI can compare this report
// after every map edit before human playtests are available.
type ResourceTopologyReport struct {
	MapName                          string                  `json:"mapName"`
	MapWidthPx                       float64                 `json:"mapWidthPx"`
	MapHeightPx                      float64                 `json:"mapHeightPx"`
	ProbeSpeedPxPerSecond            float64                 `json:"probeSpeedPxPerSecond"`
	BatRoutes                        []ResourceRouteSample   `json:"batRoutes"`
	HealthBoostRoutes                []ResourceRouteSample   `json:"healthBoostRoutes"`
	ContestSamples                   []ResourceContestSample `json:"contestSamples"`
	RouteCount                       int                     `json:"routeCount"`
	UnreachableRoutes                int                     `json:"unreachableRoutes"`
	SafeDropFailures                 int                     `json:"safeDropFailures"`
	MirroredContestMismatches        int                     `json:"mirroredContestMismatches"`
	ContestedCamps                   int                     `json:"contestedCamps"`
	MaxContestWindowMs               int64                   `json:"maxContestWindowMs"`
	BatP50Ms                         int64                   `json:"batP50Ms"`
	BatP90Ms                         int64                   `json:"batP90Ms"`
	HealthBoostP50Ms                 int64                   `json:"healthBoostP50Ms"`
	HealthBoostP90Ms                 int64                   `json:"healthBoostP90Ms"`
	ContestP50Ms                     int64                   `json:"contestP50Ms"`
	ContestP90Ms                     int64                   `json:"contestP90Ms"`
	BatTeamArrivalP50DeltaMs         int64                   `json:"batTeamArrivalP50DeltaMs"`
	BatTeamArrivalP90DeltaMs         int64                   `json:"batTeamArrivalP90DeltaMs"`
	HealthBoostTeamArrivalP50DeltaMs int64                   `json:"healthBoostTeamArrivalP50DeltaMs"`
	HealthBoostTeamArrivalP90DeltaMs int64                   `json:"healthBoostTeamArrivalP90DeltaMs"`
}

const (
	resourceTopologyProbeSpeed      = 14 * RuntimeMovementSpeedScale
	resourceTopologyCampPairs       = 3
	resourceTopologyMirrorOffset    = 4
	resourceTopologyContestWindow   = 900
	resourceTopologyMirrorTolerance = 600
)

type resourceTopologyPoint struct {
	id   string
	x, y float64
}

// BuildResourceTopologyReport measures the canonical route topology used by
// bots and players. It deliberately reuses the authoritative bot pathfinder
// and safe drop resolver, so the report catches regressions those systems
// would actually experience in a match.
func BuildResourceTopologyReport(mapName string, mapValue *gamemap.GameMap) (ResourceTopologyReport, error) {
	report := ResourceTopologyReport{
		MapName:               mapName,
		BatRoutes:             make([]ResourceRouteSample, 0),
		HealthBoostRoutes:     make([]ResourceRouteSample, 0),
		ContestSamples:        make([]ResourceContestSample, 0),
		ProbeSpeedPxPerSecond: resourceTopologyProbeSpeed,
	}
	if mapValue == nil {
		return report, fmt.Errorf("resource topology requires a map")
	}
	report.MapWidthPx, report.MapHeightPx = mapValue.WidthInPixels, mapValue.HeightInPixels
	if len(mapValue.MonsterSpawns) == 0 {
		return report, fmt.Errorf("resource topology requires authored monster spawns")
	}
	if len(mapValue.TeamSpawners["Blue"]) == 0 || len(mapValue.TeamSpawners["Red"]) == 0 {
		return report, fmt.Errorf("resource topology requires Blue and Red spawns")
	}

	state := resourceTopologyState(mapValue)
	teamOrigins := map[string][]resourceTopologyPoint{
		"Blue": resourceTopologySpawnPoints(mapValue.TeamSpawners["Blue"], "blue-spawn"),
		"Red":  resourceTopologySpawnPoints(mapValue.TeamSpawners["Red"], "red-spawn"),
	}

	for index, spawn := range mapValue.MonsterSpawns {
		resourceID := fmt.Sprintf("bat-%02d", index)
		point := resourceTopologyPoint{id: resourceID, x: spawn.X, y: spawn.Y}
		for _, team := range []string{"Blue", "Red"} {
			for _, origin := range teamOrigins[team] {
				report.BatRoutes = append(report.BatRoutes, resourceTopologyRouteSample(state, team, origin, point))
			}
		}
	}

	dropPoints := resourceTopologyDropPoints(state, mapValue, &report.SafeDropFailures)
	for _, point := range dropPoints {
		for _, team := range []string{"Blue", "Red"} {
			for _, origin := range teamOrigins[team] {
				report.HealthBoostRoutes = append(report.HealthBoostRoutes, resourceTopologyRouteSample(state, team, origin, point))
			}
		}
	}

	for index := 0; index < len(mapValue.MonsterSpawns); index++ {
		blue := resourceTopologyFastestArrival(report.BatRoutes, "Blue", fmt.Sprintf("bat-%02d", index))
		red := resourceTopologyFastestArrival(report.BatRoutes, "Red", fmt.Sprintf("bat-%02d", index))
		if blue <= 0 || red <= 0 {
			continue
		}
		window := int64(math.Abs(float64(blue - red)))
		report.ContestSamples = append(report.ContestSamples, ResourceContestSample{
			ResourceID: fmt.Sprintf("bat-%02d", index), BlueArrivalMs: blue, RedArrivalMs: red,
			ContestTimeMs: minInt64(blue, red), WindowMs: window,
			Contested: window <= resourceTopologyContestWindow,
		})
		if window <= resourceTopologyContestWindow {
			report.ContestedCamps++
		}
		if window > report.MaxContestWindowMs {
			report.MaxContestWindowMs = window
		}
	}

	report.RouteCount = len(report.BatRoutes) + len(report.HealthBoostRoutes)
	report.UnreachableRoutes += countUnreachableRoutes(report.BatRoutes) + countUnreachableRoutes(report.HealthBoostRoutes)
	report.BatP50Ms, report.BatP90Ms = routePercentiles(report.BatRoutes)
	report.HealthBoostP50Ms, report.HealthBoostP90Ms = routePercentiles(report.HealthBoostRoutes)
	report.BatTeamArrivalP50DeltaMs, report.BatTeamArrivalP90DeltaMs = teamArrivalPercentileDeltas(report.BatRoutes)
	report.HealthBoostTeamArrivalP50DeltaMs, report.HealthBoostTeamArrivalP90DeltaMs = teamArrivalPercentileDeltas(report.HealthBoostRoutes)
	report.ContestP50Ms, report.ContestP90Ms = contestPercentiles(report.ContestSamples)
	report.MirroredContestMismatches = mirroredContestMismatches(report.ContestSamples)
	return report, nil
}

func resourceTopologyState(mapValue *gamemap.GameMap) *GameState {
	state := &GameState{
		Map:         mapValue,
		Walls:       geometry.NewSpatialHash(TileSize),
		BotMemory:   make(map[string]*BotPerception),
		MapRevision: 0,
	}
	for _, wall := range mapValue.Collisions {
		state.Walls.Insert(wall)
	}
	return state
}

func resourceTopologySpawnPoints(spawns []*geometry.RectangleBody, prefix string) []resourceTopologyPoint {
	points := make([]resourceTopologyPoint, 0, len(spawns))
	for index, spawn := range spawns {
		if spawn == nil {
			continue
		}
		points = append(points, resourceTopologyPoint{
			id: fmt.Sprintf("%s-%02d", prefix, index), x: spawn.CenterX(), y: spawn.CenterY(),
		})
	}
	return points
}

func resourceTopologyDropPoints(state *GameState, mapValue *gamemap.GameMap, failures *int) []resourceTopologyPoint {
	points := make([]resourceTopologyPoint, 0, len(mapValue.TeamSpawners["Blue"])+len(mapValue.TeamSpawners["Red"])+len(mapValue.MonsterSpawns)+len(mapValue.Objectives))
	appendDrop := func(id string, x, y float64) {
		dropX, dropY := state.safeHealthBoostDropPosition(x, y, 14)
		candidate := &geometry.CircleBody{X: dropX, Y: dropY, Radius: 14}
		if geometry.CollidesCircleWithBlockingWalls(candidate, state.Walls) || mapValue.IsCircleOutside(candidate) {
			(*failures)++
		}
		points = append(points, resourceTopologyPoint{id: id, x: dropX, y: dropY})
	}
	for index, spawn := range mapValue.TeamSpawners["Blue"] {
		if spawn != nil {
			appendDrop(fmt.Sprintf("health-boost-blue-spawn-%02d", index), spawn.CenterX(), spawn.CenterY())
		}
	}
	for index, spawn := range mapValue.TeamSpawners["Red"] {
		if spawn != nil {
			appendDrop(fmt.Sprintf("health-boost-red-spawn-%02d", index), spawn.CenterX(), spawn.CenterY())
		}
	}
	for index, spawn := range mapValue.MonsterSpawns {
		appendDrop(fmt.Sprintf("health-boost-bat-%02d", index), spawn.X, spawn.Y)
	}
	for _, objective := range mapValue.Objectives {
		appendDrop("health-boost-"+objective.ID, objective.X, objective.Y)
	}
	return points
}

func resourceTopologyRouteSample(state *GameState, team string, origin, target resourceTopologyPoint) ResourceRouteSample {
	sample := ResourceRouteSample{Team: team, OriginID: origin.id, ResourceID: target.id}
	body := &geometry.CircleBody{X: origin.x, Y: origin.y, Radius: PlayerSize / 2}
	if state.Map.IsCircleOutside(body) || geometry.CollidesCircleWithBlockingWalls(body, state.Walls) {
		return sample
	}
	directX, directY := target.x-body.X, target.y-body.Y
	directDistance := math.Hypot(directX, directY)
	if directDistance < 1 || state.botDirectRouteClear(body, target.x, target.y) {
		sample.DistancePx = directDistance
		sample.TravelMs = routeTravelMs(directDistance)
		sample.Reachable = true
		return sample
	}

	path := state.findBotPath(body, target.x, target.y)
	if len(path) == 0 {
		return sample
	}
	distance := 0.0
	lastX, lastY := body.X, body.Y
	for _, waypoint := range path {
		distance += math.Hypot(waypoint.X-lastX, waypoint.Y-lastY)
		lastX, lastY = waypoint.X, waypoint.Y
	}
	// The final grid cell is the interaction cell. The target may be a few
	// pixels away from its centre, but pickup collision supplies the remaining
	// tolerance in the live game.
	sample.DistancePx = distance
	sample.TravelMs = routeTravelMs(distance)
	sample.Reachable = distance > 0
	return sample
}

func routeTravelMs(distance float64) int64 {
	if distance <= 0 {
		return 0
	}
	return int64(math.Ceil(distance / resourceTopologyProbeSpeed * 1000))
}

func resourceTopologyFastestArrival(routes []ResourceRouteSample, team, resourceID string) int64 {
	fastest := int64(0)
	for _, route := range routes {
		if route.Team != team || route.ResourceID != resourceID || !route.Reachable {
			continue
		}
		if fastest == 0 || route.TravelMs < fastest {
			fastest = route.TravelMs
		}
	}
	return fastest
}

func countUnreachableRoutes(routes []ResourceRouteSample) int {
	count := 0
	for _, route := range routes {
		if !route.Reachable {
			count++
		}
	}
	return count
}

func routePercentiles(routes []ResourceRouteSample) (int64, int64) {
	values := make([]int64, 0, len(routes))
	for _, route := range routes {
		if route.Reachable && route.TravelMs > 0 {
			values = append(values, route.TravelMs)
		}
	}
	return percentiles(values)
}

// teamArrivalPercentileDeltas compares aggregate route percentiles, keeping
// the acceptance gate readable: a zero p50 delta means both teams reach the
// resource network in the same median time, while p90 catches a disadvantaged
// tail route. Unreachable samples are omitted consistently with route
// percentiles above.
func teamArrivalPercentileDeltas(routes []ResourceRouteSample) (int64, int64) {
	blueP50, blueP90 := routePercentilesForTeam(routes, "Blue")
	redP50, redP90 := routePercentilesForTeam(routes, "Red")
	return absInt64(blueP50 - redP50), absInt64(blueP90 - redP90)
}

func routePercentilesForTeam(routes []ResourceRouteSample, team string) (int64, int64) {
	filtered := make([]ResourceRouteSample, 0, len(routes))
	for _, route := range routes {
		if route.Team == team {
			filtered = append(filtered, route)
		}
	}
	return routePercentiles(filtered)
}

func absInt64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}

func contestPercentiles(samples []ResourceContestSample) (int64, int64) {
	values := make([]int64, 0, len(samples))
	for _, sample := range samples {
		if sample.ContestTimeMs > 0 {
			values = append(values, sample.ContestTimeMs)
		}
	}
	return percentiles(values)
}

func percentiles(values []int64) (int64, int64) {
	if len(values) == 0 {
		return 0, 0
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	percentile := func(fraction float64) int64 {
		index := int(math.Ceil(float64(len(values))*fraction)) - 1
		if index < 0 {
			index = 0
		}
		if index >= len(values) {
			index = len(values) - 1
		}
		return values[index]
	}
	return percentile(.5), percentile(.9)
}

func mirroredContestMismatches(samples []ResourceContestSample) int {
	byID := make(map[string]ResourceContestSample, len(samples))
	for _, sample := range samples {
		byID[sample.ResourceID] = sample
	}
	mismatches := 0
	for index := 0; index < resourceTopologyCampPairs; index++ {
		first, firstOK := byID[fmt.Sprintf("bat-%02d", index)]
		mirror, mirrorOK := byID[fmt.Sprintf("bat-%02d", index+resourceTopologyMirrorOffset)]
		if !firstOK || !mirrorOK {
			mismatches++
			continue
		}
		if math.Abs(float64(first.BlueArrivalMs-mirror.RedArrivalMs)) > resourceTopologyMirrorTolerance || math.Abs(float64(first.RedArrivalMs-mirror.BlueArrivalMs)) > resourceTopologyMirrorTolerance {
			mismatches++
		}
	}
	// Camps on the main diagonal are their own mirrors. They should therefore
	// have equivalent arrival times for Blue and Red without being paired with
	// another camp slot.
	for _, resourceID := range []string{"bat-03", "bat-07"} {
		sample, ok := byID[resourceID]
		if !ok || math.Abs(float64(sample.BlueArrivalMs-sample.RedArrivalMs)) > resourceTopologyMirrorTolerance {
			mismatches++
		}
	}
	return mismatches
}

func minInt64(first, second int64) int64 {
	if first < second {
		return first
	}
	return second
}

// StableJSON is used by scenario tests and CI artifacts. Reports contain only
// ordered slices and scalar fields, so encoding/json is stable by construction.
func (report ResourceTopologyReport) StableJSON() []byte {
	data, _ := json.Marshal(report)
	return data
}
