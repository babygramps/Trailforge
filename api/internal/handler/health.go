package handler

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/config"
	"github.com/babygramps/trailforge/internal/repository"
)

const apiVersion = "0.1.0"

// HealthHandler serves system health checks.
type HealthHandler struct {
	db  *repository.DB
	cfg *config.Config
}

// NewHealthHandler returns a new HealthHandler.
func NewHealthHandler(db *repository.DB, cfg *config.Config) *HealthHandler {
	return &HealthHandler{db: db, cfg: cfg}
}

// Register attaches health routes to the given echo group.
func (h *HealthHandler) Register(g *echo.Group) {
	g.GET("", h.Check)
}

// Check returns the overall health status and reachability of backing services.
func (h *HealthHandler) Check(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	dbOK := h.db.Healthy(ctx)

	valhallaOK := checkHTTP(ctx, h.cfg.ValhallaURL+"/status")
	tilesOK := checkHTTP(ctx, h.cfg.TileServerURL+"/health")

	overall := "ok"
	code := http.StatusOK
	if !dbOK {
		overall = "degraded"
		code = http.StatusServiceUnavailable
	}

	return c.JSON(code, map[string]any{
		"status":  overall,
		"version": apiVersion,
		"services": map[string]string{
			"db":       boolStatus(dbOK),
			"valhalla": boolStatus(valhallaOK),
			"tiles":    boolStatus(tilesOK),
		},
	})
}

func boolStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "unavailable"
}

func checkHTTP(ctx context.Context, url string) bool {
	if url == "" {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("health check failed for %s: %v\n", url, err)
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}
