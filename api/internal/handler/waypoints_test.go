package handler

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/testdata"
)

func createTestWaypoint(t *testing.T, e *echo.Echo, userID string) string {
	t.Helper()
	body := `{"name":"Half Dome","description":"Famous granite crest","lat":` +
		`37.7459,"lon":-119.5332,"ele":2693.0,"icon":"mountain","color":"#ff0000"}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/waypoints", body, userID)
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("createTestWaypoint: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	m := parseJSON(rec)
	return m["id"].(string)
}

func TestAPI_Waypoints_Create_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	body := `{"name":"Half Dome","description":"Granite crest","lat":` +
		fmtFloat(testdata.HalfDomeWaypointLat) + `,"lon":` +
		fmtFloat(testdata.HalfDomeWaypointLon) + `,"ele":` +
		fmtFloat(testdata.HalfDomeWaypointEle) + `,"icon":"peak","color":"#336699"}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/waypoints", body, "user-wp")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["id"] == nil {
		t.Fatal("response missing id")
	}
	if m["name"] != "Half Dome" {
		t.Fatalf("expected name 'Half Dome', got %v", m["name"])
	}
}

func TestAPI_Waypoints_Create_MissingName(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	body := `{"description":"no name","lat":37.0,"lon":-119.0}`
	req, rec := newAuthenticatedRequest(http.MethodPost, "/api/waypoints", body, "user-wp")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Waypoints_GetByID_WrongOwner(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	wpID := createTestWaypoint(t, e, "user-A")

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/waypoints/"+wpID, "", "user-B")
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Waypoints_List_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	userID := "user-list-wp"
	for i := 0; i < 3; i++ {
		createTestWaypoint(t, e, userID)
	}

	req, rec := newAuthenticatedRequest(http.MethodGet, "/api/waypoints", "", userID)
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

func TestAPI_Waypoints_Update_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	userID := "user-up-wp"
	wpID := createTestWaypoint(t, e, userID)

	updateBody := `{"name":"El Capitan"}`
	req, rec := newAuthenticatedRequest(http.MethodPut, "/api/waypoints/"+wpID, updateBody, userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["name"] != "El Capitan" {
		t.Fatalf("expected name 'El Capitan', got %v", m["name"])
	}
}

func TestAPI_Waypoints_Delete_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	wpRepo := newMockWaypointRepo()
	e := newTestEcho(userRepo, nil, wpRepo)

	userID := "user-del-wp"
	wpID := createTestWaypoint(t, e, userID)

	req, rec := newAuthenticatedRequest(http.MethodDelete, "/api/waypoints/"+wpID, "", userID)
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}
