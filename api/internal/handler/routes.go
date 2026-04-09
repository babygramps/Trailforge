package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/model"
)

// RouteHandler serves CRUD and routing endpoints for planned routes.
type RouteHandler struct {
	pool        *pgxpool.Pool
	valhallaURL string
}

// NewRouteHandler returns a new RouteHandler.
func NewRouteHandler(pool *pgxpool.Pool, valhallaURL string) *RouteHandler {
	return &RouteHandler{pool: pool, valhallaURL: valhallaURL}
}

// Register attaches route endpoints to the given echo group.
func (h *RouteHandler) Register(g *echo.Group) {
	g.POST("", h.Create)
	g.GET("", h.List)
	g.GET("/:id", h.GetByID)
	g.PUT("/:id", h.Update)
	g.DELETE("/:id", h.Delete)
	g.GET("/:id/directions", h.Directions)
}

// Create handles POST /api/routes.
func (h *RouteHandler) Create(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var req model.CreateRouteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Name == "" || len(req.Geometry) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "name and geometry are required")
	}

	waypointsJSON := "{}"
	if len(req.Waypoints) > 0 {
		waypointsJSON = string(req.Waypoints)
	}

	query := `
		INSERT INTO routes (user_id, name, activity_type, description, geometry, waypoints, total_distance, estimated_duration)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
		RETURNING id, created_at, updated_at`

	route := &model.Route{
		UserID:            userID,
		Name:              req.Name,
		ActivityType:      req.ActivityType,
		Description:       req.Description,
		Geometry:          req.Geometry,
		Waypoints:         req.Waypoints,
		TotalDistance:      req.TotalDistance,
		EstimatedDuration: req.EstimatedDuration,
	}

	err := h.pool.QueryRow(c.Request().Context(), query,
		userID, req.Name, req.ActivityType, req.Description,
		string(req.Geometry), waypointsJSON,
		req.TotalDistance, req.EstimatedDuration,
	).Scan(&route.ID, &route.CreatedAt, &route.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create route: "+err.Error())
	}

	return c.JSON(http.StatusCreated, route)
}

// GetByID handles GET /api/routes/:id.
func (h *RouteHandler) GetByID(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	route, err := h.getRoute(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "route not found")
	}
	if route.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	return c.JSON(http.StatusOK, route)
}

// List handles GET /api/routes.
func (h *RouteHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var p model.Pagination
	if err := c.Bind(&p); err != nil || p.Limit <= 0 {
		p = model.Pagination{Limit: 50, Offset: 0}
	}

	query := `
		SELECT
			id, user_id, name, activity_type, description,
			geometry,
			waypoints,
			total_distance, estimated_duration,
			created_at, updated_at
		FROM routes
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := h.pool.Query(c.Request().Context(), query, userID, p.Limit, p.Offset)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list routes: "+err.Error())
	}
	defer rows.Close()

	var routes []model.Route
	for rows.Next() {
		var r model.Route
		var geom, wps []byte
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.Name, &r.ActivityType, &r.Description,
			&geom, &wps,
			&r.TotalDistance, &r.EstimatedDuration,
			&r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to scan route: "+err.Error())
		}
		r.Geometry = json.RawMessage(geom)
		r.Waypoints = json.RawMessage(wps)
		routes = append(routes, r)
	}
	if routes == nil {
		routes = []model.Route{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"routes": routes,
		"count":  len(routes),
	})
}

// Update handles PUT /api/routes/:id.
func (h *RouteHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.getRoute(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "route not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req model.UpdateRouteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.ActivityType != nil {
		existing.ActivityType = *req.ActivityType
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Geometry != nil {
		existing.Geometry = *req.Geometry
	}
	if req.Waypoints != nil {
		existing.Waypoints = *req.Waypoints
	}
	if req.TotalDistance != nil {
		existing.TotalDistance = *req.TotalDistance
	}
	if req.EstimatedDuration != nil {
		existing.EstimatedDuration = *req.EstimatedDuration
	}

	updateQuery := `
		UPDATE routes
		SET name = $2, activity_type = $3, description = $4,
			geometry = $5::jsonb,
			waypoints = $6::jsonb, total_distance = $7, estimated_duration = $8,
			updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	err = h.pool.QueryRow(c.Request().Context(), updateQuery,
		id, existing.Name, existing.ActivityType, existing.Description,
		string(existing.Geometry), string(existing.Waypoints),
		existing.TotalDistance, existing.EstimatedDuration,
	).Scan(&existing.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update route: "+err.Error())
	}

	return c.JSON(http.StatusOK, existing)
}

// Delete handles DELETE /api/routes/:id.
func (h *RouteHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.getRoute(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "route not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	tag, err := h.pool.Exec(c.Request().Context(), `DELETE FROM routes WHERE id = $1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete route: "+err.Error())
	}
	if tag.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "route not found")
	}

	return c.NoContent(http.StatusNoContent)
}

// Directions handles GET /api/routes/:id/directions by proxying to Valhalla.
func (h *RouteHandler) Directions(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	route, err := h.getRoute(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "route not found")
	}
	if route.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	if h.valhallaURL == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "routing engine not configured")
	}

	// Extract coordinates from route geometry to build a Valhalla request.
	var geom struct {
		Coordinates [][]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(route.Geometry, &geom); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "invalid route geometry")
	}

	// Build Valhalla locations from the route's geometry.
	type valhallaLocation struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}
	locations := make([]valhallaLocation, 0, len(geom.Coordinates))
	for _, coord := range geom.Coordinates {
		if len(coord) >= 2 {
			locations = append(locations, valhallaLocation{Lat: coord[1], Lon: coord[0]})
		}
	}

	// Map activity type to Valhalla costing model.
	costing := "pedestrian"
	switch route.ActivityType {
	case model.ActivityBike:
		costing = "bicycle"
	case model.ActivityPaddle:
		costing = "pedestrian" // Valhalla has no paddle mode; fall back.
	}

	valhallaReq := map[string]any{
		"locations": locations,
		"costing":   costing,
		"directions_options": map[string]string{
			"units": "kilometers",
		},
	}

	body, err := json.Marshal(valhallaReq)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build routing request")
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.valhallaURL+"/route", io.NopCloser(jsonReader(body)))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create routing request")
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "routing engine unavailable: "+err.Error())
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to read routing response")
	}

	return c.JSONBlob(resp.StatusCode, respBody)
}

// getRoute is a helper that fetches a single route by ID.
func (h *RouteHandler) getRoute(ctx context.Context, id string) (*model.Route, error) {
	query := `
		SELECT
			id, user_id, name, activity_type, description,
			geometry,
			waypoints,
			total_distance, estimated_duration,
			created_at, updated_at
		FROM routes
		WHERE id = $1`

	r := &model.Route{}
	var geom, wps []byte
	err := h.pool.QueryRow(ctx, query, id).Scan(
		&r.ID, &r.UserID, &r.Name, &r.ActivityType, &r.Description,
		&geom, &wps,
		&r.TotalDistance, &r.EstimatedDuration,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("route not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying route: %w", err)
	}
	r.Geometry = json.RawMessage(geom)
	r.Waypoints = json.RawMessage(wps)
	return r, nil
}

// jsonReader wraps a byte slice for use as an io.Reader.
func jsonReader(b []byte) io.Reader {
	return io.NopCloser(bytesReader(b))
}

type bytesReaderWrapper struct {
	data []byte
	pos  int
}

func bytesReader(b []byte) *bytesReaderWrapper {
	return &bytesReaderWrapper{data: b}
}

func (r *bytesReaderWrapper) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
