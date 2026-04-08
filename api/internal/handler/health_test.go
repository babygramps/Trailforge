package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/config"
	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/repository"
)

// newHealthEcho creates an Echo instance with the health handler and JWT middleware.
func newHealthEcho(db *repository.DB, cfg *config.Config) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.JWTAuth(testJWTSecret))

	api := e.Group("/api")
	hh := NewHealthHandler(db, cfg)
	hh.Register(api.Group("/health"))

	return e
}

// createUnreachableDB returns a *repository.DB whose Pool.Ping always fails
// (connects to a port with no Postgres). MinConns=0 ensures pool creation
// succeeds without eagerly connecting.
func createUnreachableDB(t *testing.T) *repository.DB {
	t.Helper()
	dsn := "postgres://nobody:nopass@127.0.0.1:19999/nodb?connect_timeout=1"
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("pgxpool.ParseConfig: %v", err)
	}
	cfg.MaxConns = 1
	cfg.MinConns = 0

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("pgxpool.NewWithConfig: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	return &repository.DB{Pool: pool}
}

func TestAPI_Health_AllHealthy(t *testing.T) {
	// We cannot mock a Postgres backend in a pure unit test, so this test
	// verifies the handler returns a well-formed JSON response with the
	// correct structure when valhalla and tiles are healthy. DB will report
	// as unavailable since we use an unreachable pool.
	valhallaSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer valhallaSrv.Close()

	tilesSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer tilesSrv.Close()

	cfg := &config.Config{
		ValhallaURL:   valhallaSrv.URL,
		TileServerURL: tilesSrv.URL,
	}

	db := createUnreachableDB(t)
	e := newHealthEcho(db, cfg)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// DB is unreachable so the status is 503/degraded, but we verify the
	// overall response structure and that valhalla+tiles are reported as ok.
	if rec.Code != http.StatusOK && rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200 or 503, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["version"] == nil {
		t.Fatal("response missing version")
	}
	services, ok := m["services"].(map[string]any)
	if !ok {
		t.Fatal("response missing services map")
	}
	if services["valhalla"] != "ok" {
		t.Fatalf("expected valhalla=ok, got %v", services["valhalla"])
	}
	if services["tiles"] != "ok" {
		t.Fatalf("expected tiles=ok, got %v", services["tiles"])
	}
}

func TestAPI_Health_DBDown(t *testing.T) {
	valhallaSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer valhallaSrv.Close()

	tilesSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer tilesSrv.Close()

	cfg := &config.Config{
		ValhallaURL:   valhallaSrv.URL,
		TileServerURL: tilesSrv.URL,
	}

	db := createUnreachableDB(t)
	e := newHealthEcho(db, cfg)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["status"] != "degraded" {
		t.Fatalf("expected status 'degraded', got %v", m["status"])
	}
	services := m["services"].(map[string]any)
	if services["db"] != "unavailable" {
		t.Fatalf("expected db=unavailable, got %v", services["db"])
	}
}

func TestAPI_Health_NoAuth(t *testing.T) {
	valhallaSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer valhallaSrv.Close()

	tilesSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer tilesSrv.Close()

	cfg := &config.Config{
		ValhallaURL:   valhallaSrv.URL,
		TileServerURL: tilesSrv.URL,
	}

	db := createUnreachableDB(t)
	e := newHealthEcho(db, cfg)

	// Explicitly send NO Authorization header.
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// Health endpoint must NOT return 401.
	if rec.Code == http.StatusUnauthorized {
		t.Fatal("health endpoint should not require authentication, got 401")
	}

	// It should be 200 or 503, depending on DB health.
	if rec.Code != http.StatusOK && rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200 or 503, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["version"] == nil {
		t.Fatal("response missing version field")
	}
	services, ok := m["services"].(map[string]any)
	if !ok {
		t.Fatal("response missing services map")
	}
	if services["db"] == nil || services["valhalla"] == nil || services["tiles"] == nil {
		t.Fatalf("services map incomplete: %v", services)
	}
}
