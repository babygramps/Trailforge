package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/testdata"
	"github.com/google/uuid"
)

// lineStringGeometry is the Yosemite trail as a plain GeoJSON LineString
// (not wrapped in a Feature), which is what GenerateGPX expects.
const lineStringGeometry = `{"type":"LineString","coordinates":[[-119.5966,37.7567,1209],[-119.5963,37.7571,1215.4],[-119.5958,37.7576,1223.1],[-119.5952,37.758,1232.7],[-119.5947,37.7585,1241.3]]}`

func createTestTrack(t *testing.T, e *echo.Echo, userID string) string {
	t.Helper()
	body := `{"name":"Test Trail","activity_type":"hike","geometry":` + testdata.YosemiteTrailGeoJSON + `,"stats":` + testdata.YosemiteTrackStats + `}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks", body, userID)
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("createTestTrack: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	m := parseJSON(rec)
	return m["id"].(string)
}

func createTestTrackLineString(t *testing.T, e *echo.Echo, userID string) string {
	t.Helper()
	body := `{"name":"GPX Trail","activity_type":"hike","geometry":` + lineStringGeometry + `,"stats":` + testdata.YosemiteTrackStats + `}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks", body, userID)
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("createTestTrackLineString: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	m := parseJSON(rec)
	return m["id"].(string)
}

func TestAPI_Tracks_Create_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-1"
	body := `{"name":"Yosemite Loop","activity_type":"hike","geometry":` + testdata.YosemiteTrailGeoJSON + `,"stats":` + testdata.YosemiteTrackStats + `}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks", body, userID)

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["id"] == nil {
		t.Fatal("response missing id")
	}
	if m["name"] != "Yosemite Loop" {
		t.Fatalf("expected name 'Yosemite Loop', got %v", m["name"])
	}
}

func TestAPI_Tracks_Create_NoAuth(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	body := `{"name":"Yosemite Loop","activity_type":"hike","geometry":` + testdata.YosemiteTrailGeoJSON + `}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks", body, "") // no userID => no auth header

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_Create_MissingGeometry(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	body := `{"name":"Yosemite Loop","activity_type":"hike"}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks", body, "user-1")

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_GetByID_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-1"
	trackID := createTestTrack(t, e, userID)

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks/"+trackID, "", userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["id"] != trackID {
		t.Fatalf("expected id %s, got %v", trackID, m["id"])
	}
}

func TestAPI_Tracks_GetByID_NotFound(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks/"+uuid.NewString(), "", "user-1")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_GetByID_WrongOwner(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	trackID := createTestTrack(t, e, "user-A")

	// User B tries to access.
	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks/"+trackID, "", "user-B")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_List_Empty(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks?limit=50&offset=0", "", "user-empty")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	tracks, ok := m["tracks"].([]any)
	if !ok {
		t.Fatal("response missing tracks array")
	}
	if len(tracks) != 0 {
		t.Fatalf("expected 0 tracks, got %d", len(tracks))
	}
	count, ok := m["count"].(float64)
	if !ok || count != 0 {
		t.Fatalf("expected count 0, got %v", m["count"])
	}
}

func TestAPI_Tracks_List_WithData(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-list"
	for i := 0; i < 3; i++ {
		createTestTrack(t, e, userID)
	}

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks?limit=50&offset=0", "", userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	count := int(m["count"].(float64))
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}
}

func TestAPI_Tracks_Update_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-up"
	trackID := createTestTrack(t, e, userID)

	updateBody := `{"name":"Updated Name"}`
	req, rec := newAuthenticatedRequest(http.MethodPut, "/api/tracks/"+trackID, updateBody, userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["name"] != "Updated Name" {
		t.Fatalf("expected name 'Updated Name', got %v", m["name"])
	}
}

func TestAPI_Tracks_Update_WrongOwner(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	trackID := createTestTrack(t, e, "user-A")

	updateBody := `{"name":"Hacked Name"}`
	req, rec := newAuthenticatedRequest(http.MethodPut, "/api/tracks/"+trackID, updateBody, "user-B")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_Delete_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-del"
	trackID := createTestTrack(t, e, userID)

	req, rec := newAuthenticatedRequest(http.MethodDelete, "/api/tracks/"+trackID, "", userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_Delete_WrongOwner(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	trackID := createTestTrack(t, e, "user-A")

	req, rec := newAuthenticatedRequest(http.MethodDelete, "/api/tracks/"+trackID, "", "user-B")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_AppendPoints_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-append"
	trackID := createTestTrack(t, e, userID)

	points := []map[string]float64{
		{"lat": 37.76, "lon": -119.59, "ele": 1200},
		{"lat": 37.761, "lon": -119.591, "ele": 1210},
		{"lat": 37.762, "lon": -119.592, "ele": 1220},
		{"lat": 37.763, "lon": -119.593, "ele": 1230},
		{"lat": 37.764, "lon": -119.594, "ele": 1240},
	}
	pointsJSON, _ := json.Marshal(map[string]any{"points": points})

	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks/"+trackID+"/points", string(pointsJSON), userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	appended := int(m["appended"].(float64))
	if appended != 5 {
		t.Fatalf("expected appended=5, got %d", appended)
	}
}

func TestAPI_Tracks_AppendPoints_EmptyBody(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-append-empty"
	trackID := createTestTrack(t, e, userID)

	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/tracks/"+trackID+"/points", `{"points":[]}`, userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Tracks_ExportGPX_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	userID := "user-gpx"
	// Use a plain LineString geometry that GenerateGPX can parse directly.
	trackID := createTestTrackLineString(t, e, userID)

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks/"+trackID+"/gpx", "", userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	ct := rec.Header().Get("Content-Type")
	if !strings.Contains(ct, "application/gpx+xml") {
		t.Fatalf("expected Content-Type application/gpx+xml, got %s", ct)
	}
}

func TestAPI_Tracks_ExportGPX_WrongOwner(t *testing.T) {
	userRepo := newMockUserRepo()
	trackRepo := newMockTrackRepo()
	e := newTestEcho(userRepo, trackRepo, nil)

	trackID := createTestTrackLineString(t, e, "user-A")

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/tracks/"+trackID+"/gpx", "", "user-B")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}
