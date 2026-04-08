package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/internal/repository"
	"github.com/babygramps/trailforge/internal/service"
)

// TrackHandler serves CRUD and utility endpoints for GPS tracks.
type TrackHandler struct {
	tracks repository.TrackRepo
}

// NewTrackHandler returns a new TrackHandler.
func NewTrackHandler(tracks repository.TrackRepo) *TrackHandler {
	return &TrackHandler{tracks: tracks}
}

// Register attaches track routes to the given echo group.
func (h *TrackHandler) Register(g *echo.Group) {
	g.POST("", h.Create)
	g.GET("", h.List)
	g.GET("/:id", h.GetByID)
	g.PUT("/:id", h.Update)
	g.DELETE("/:id", h.Delete)
	g.POST("/:id/points", h.AppendPoints)
	g.GET("/:id/gpx", h.ExportGPX)
	g.POST("/import", h.ImportGPX)
}

// Create handles POST /api/tracks.
func (h *TrackHandler) Create(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var req model.CreateTrackRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Name == "" || len(req.Geometry) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "name and geometry are required")
	}

	track := &model.Track{
		UserID:       userID,
		Name:         req.Name,
		ActivityType: req.ActivityType,
		Description:  req.Description,
		Geometry:     req.Geometry,
		Stats:        req.Stats,
	}

	if err := h.tracks.Create(c.Request().Context(), track); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create track: "+err.Error())
	}

	return c.JSON(http.StatusCreated, track)
}

// GetByID handles GET /api/tracks/:id.
func (h *TrackHandler) GetByID(c echo.Context) error {
	id := c.Param("id")

	track, err := h.tracks.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "track not found")
	}

	// Ensure the requester owns the track.
	userID := middleware.GetUserID(c)
	if track.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	return c.JSON(http.StatusOK, track)
}

// List handles GET /api/tracks with optional bounding-box filter.
func (h *TrackHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	var p model.Pagination
	if err := c.Bind(&p); err != nil {
		p = model.Pagination{Limit: 50, Offset: 0}
	}

	// Check for spatial bounding box parameters.
	var bbox model.BBox
	if err := c.Bind(&bbox); err == nil && bbox.MaxLon != 0 {
		tracks, err := h.tracks.ListInBounds(c.Request().Context(), userID, bbox, p)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to list tracks: "+err.Error())
		}
		if tracks == nil {
			tracks = []model.Track{}
		}
		return c.JSON(http.StatusOK, map[string]any{
			"tracks": tracks,
			"count":  len(tracks),
		})
	}

	tracks, err := h.tracks.List(c.Request().Context(), userID, p)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list tracks: "+err.Error())
	}
	if tracks == nil {
		tracks = []model.Track{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"tracks": tracks,
		"count":  len(tracks),
	})
}

// Update handles PUT /api/tracks/:id.
func (h *TrackHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.tracks.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "track not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req model.UpdateTrackRequest
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
	if req.Stats != nil {
		existing.Stats = *req.Stats
	}

	if err := h.tracks.Update(c.Request().Context(), existing); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update track: "+err.Error())
	}

	return c.JSON(http.StatusOK, existing)
}

// Delete handles DELETE /api/tracks/:id.
func (h *TrackHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.tracks.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "track not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	if err := h.tracks.Delete(c.Request().Context(), id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete track: "+err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// AppendPoints handles POST /api/tracks/:id/points for batch GPS point appending.
func (h *TrackHandler) AppendPoints(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	existing, err := h.tracks.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "track not found")
	}
	if existing.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req model.BatchPointsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if len(req.Points) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "at least one point is required")
	}

	if err := h.tracks.AppendPoints(c.Request().Context(), id, req.Points); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to append points: "+err.Error())
	}

	return c.JSON(http.StatusOK, map[string]any{
		"appended": len(req.Points),
	})
}

// ExportGPX handles GET /api/tracks/:id/gpx and returns the track as a GPX file.
func (h *TrackHandler) ExportGPX(c echo.Context) error {
	id := c.Param("id")
	userID := middleware.GetUserID(c)

	track, err := h.tracks.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "track not found")
	}
	if track.UserID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	gpxData, err := service.GenerateGPX(track)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate GPX: "+err.Error())
	}

	c.Response().Header().Set("Content-Disposition", "attachment; filename=\""+track.Name+".gpx\"")
	return c.Blob(http.StatusOK, "application/gpx+xml", gpxData)
}

// ImportGPX handles POST /api/tracks/import for uploading a GPX file.
func (h *TrackHandler) ImportGPX(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file upload required")
	}

	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to open uploaded file")
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to read uploaded file")
	}

	track, err := service.ParseGPX(data)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid GPX file: "+err.Error())
	}

	track.UserID = userID
	if track.Stats == nil {
		track.Stats = json.RawMessage(`{}`)
	}

	if err := h.tracks.Create(c.Request().Context(), track); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save track: "+err.Error())
	}

	return c.JSON(http.StatusCreated, track)
}
