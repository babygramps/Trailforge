package model

import (
	"encoding/json"
	"time"
)

// ActivityType enumerates supported outdoor activity types.
type ActivityType string

const (
	ActivityBike   ActivityType = "bike"
	ActivityHike   ActivityType = "hike"
	ActivityPaddle ActivityType = "paddle"
)

// Track represents a recorded GPS track with PostGIS geometry.
type Track struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	Name         string          `json:"name"`
	ActivityType ActivityType    `json:"activity_type"`
	Description  string          `json:"description"`
	Geometry     json.RawMessage `json:"geometry"`      // GeoJSON LineStringZ
	Stats        json.RawMessage `json:"stats"`         // JSONB blob
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// TrackStats holds computed statistics for a track.
type TrackStats struct {
	Distance      float64            `json:"distance_m"`
	Duration      float64            `json:"duration_s"`
	ElevationGain float64            `json:"elevation_gain_m"`
	ElevationLoss float64            `json:"elevation_loss_m"`
	AvgSpeed      float64            `json:"avg_speed_mps"`
	HRZones       map[string]float64 `json:"hr_zones,omitempty"`
}

// CreateTrackRequest is the payload for creating a new track.
type CreateTrackRequest struct {
	Name         string          `json:"name" validate:"required"`
	ActivityType ActivityType    `json:"activity_type" validate:"required"`
	Description  string          `json:"description"`
	Geometry     json.RawMessage `json:"geometry" validate:"required"`
	Stats        json.RawMessage `json:"stats"`
}

// UpdateTrackRequest is the payload for updating an existing track.
type UpdateTrackRequest struct {
	Name         *string          `json:"name"`
	ActivityType *ActivityType    `json:"activity_type"`
	Description  *string          `json:"description"`
	Geometry     *json.RawMessage `json:"geometry"`
	Stats        *json.RawMessage `json:"stats"`
}

// BatchPointsRequest is the payload for appending GPS points to a track.
type BatchPointsRequest struct {
	Points []Point `json:"points" validate:"required,min=1"`
}

// Point represents a single GPS point with optional elevation and timestamp.
type Point struct {
	Lat       float64    `json:"lat"`
	Lon       float64    `json:"lon"`
	Ele       float64    `json:"ele"`
	Timestamp *time.Time `json:"timestamp,omitempty"`
}

// BBox represents a spatial bounding box for queries.
type BBox struct {
	MinLon float64 `query:"min_lon"`
	MinLat float64 `query:"min_lat"`
	MaxLon float64 `query:"max_lon"`
	MaxLat float64 `query:"max_lat"`
}

// Pagination holds limit/offset parameters for list queries.
type Pagination struct {
	Limit  int `query:"limit"`
	Offset int `query:"offset"`
}
