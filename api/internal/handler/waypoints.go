package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/internal/repository"
)

// WaypointHandler serves CRUD endpoints for waypoints.
type WaypointHandler struct {
	waypoints repository.WaypointRepo
}

// NewWaypointHandler returns a new WaypointHandler.
func NewWaypointHandler(waypoints repository.WaypointRepo) *WaypointHandler {
	return &WaypointHandler{waypoints: waypoints}
}

// Register attaches waypoint routes to the given echo group.
func (h *WaypointHandler) Register(g *echo.Group) {
	g.POST("", h.Create)
	g.GET("", h.List)
	g.GET("/:id", h.GetByID)
	g.PUT("/:id", h.Update)
	g.DELETE("/:id", h.Delete)
}

// Create handles POST /api/waypoints.
func (h *WaypointHandler) Create(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var req model.CreateWaypointRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	wp := &model.Waypoint{
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		Lat:         req.Lat,
		Lon:         req.Lon,
		Ele:         req.Ele,
		Icon:        req.Icon,
		Color:       req.Color,
	}

	if err := h.waypoints.Create(c.Request().Context(), wp); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create waypoint: "+err.Error())
	}

	return c.JSON(http.StatusCreated, wp)
}

// GetByID handles GET /api/waypoints/:id.
func (h *WaypointHandler) GetByID(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	wp, err := h.waypoints.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "waypoint not found")
	}
	if wp.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	return c.JSON(http.StatusOK, wp)
}

// List handles GET /api/waypoints.
func (h *WaypointHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var p model.Pagination
	if err := c.Bind(&p); err != nil || p.Limit <= 0 {
		p = model.Pagination{Limit: 50, Offset: 0}
	}

	waypoints, err := h.waypoints.List(c.Request().Context(), userID, p)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list waypoints: "+err.Error())
	}
	if waypoints == nil {
		waypoints = []model.Waypoint{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"waypoints": waypoints,
		"count":     len(waypoints),
	})
}

// Update handles PUT /api/waypoints/:id.
func (h *WaypointHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.waypoints.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "waypoint not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req model.UpdateWaypointRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Lat != nil {
		existing.Lat = *req.Lat
	}
	if req.Lon != nil {
		existing.Lon = *req.Lon
	}
	if req.Ele != nil {
		existing.Ele = *req.Ele
	}
	if req.Icon != nil {
		existing.Icon = *req.Icon
	}
	if req.Color != nil {
		existing.Color = *req.Color
	}

	if err := h.waypoints.Update(c.Request().Context(), existing); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update waypoint: "+err.Error())
	}

	return c.JSON(http.StatusOK, existing)
}

// Delete handles DELETE /api/waypoints/:id.
func (h *WaypointHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.waypoints.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "waypoint not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	if err := h.waypoints.Delete(c.Request().Context(), id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete waypoint: "+err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
