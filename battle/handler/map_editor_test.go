package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestHandleMapEditorApplyWritesNorthernMapSource(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	sourcePath := t.TempDir() + string(os.PathSeparator) + "edited_team_battle_northern_map.go"
	t.Setenv("MAP_EDITOR_SOURCE_FILE", sourcePath)
	request := httptest.NewRequest(http.MethodPost, "/map-editor/apply", strings.NewReader(`{
    "map": "team-battle-northern",
    "walls": [{"minX": 20, "minY": 40, "maxX": 60, "maxY": 80, "type": "city_object", "rotation": 0.5, "linkedFeatureId": "bridge-a", "bushGroup": 3}],
    "features": [{"id": "bridge-a", "type": "river_bridge", "x": 100, "y": 120, "rotation": 0.25, "scale": 1.2}]
}`))
	recorder := httptest.NewRecorder()

	NewHandler().HandleMapEditorApply(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	source, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read generated source: %v", err)
	}
	content := string(source)
	for _, expected := range []string{
		"package gamemap",
		"func applyEditedTeamBattleNorthernMap(gm *GameMap)",
		"Rotation: 0.5",
		"LinkedFeatureID: \"bridge-a\"",
		"BushGroup: 3",
		"ID: \"bridge-a\"",
		"Scale: 1.2",
	} {
		if !strings.Contains(content, expected) {
			t.Fatalf("generated source does not contain %q:\n%s", expected, content)
		}
	}
}

func TestHandleMapEditorApplyIsDisabledInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/map-editor/apply", strings.NewReader(`{"map":"team-battle-northern"}`))

	NewHandler().HandleMapEditorApply(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("production status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}
