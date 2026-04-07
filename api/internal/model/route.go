package model

import (
	"encoding/json"
	"time"
)

// Route represents a planned route with ordered waypoints and geometry.
type Route struct {
	ID                string          `json:"id"`
	UserID            string          `json:"user_id"`
	Name              string          `json:"name"`
	ActivityType      ActivityType    `json:"activity_type"`
	Description       string          `json:"description"`
	Geometry          json.RawMessage `json:"geometry"`           // GeoJSON LineString
	Waypoints         json.RawMessage `json:"waypoints"`          // JSONB ordered waypoint refs
	TotalDistance     float64         `json:"total_distance"`     // metres
	EstimatedDuration float64         `json:"estimated_duration"` // seconds
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// CreateRouteRequest is the payload for creating a new route.
type CreateRouteRequest struct {
	Name              string          `json:"name" validate:"required"`
	ActivityType      ActivityType    `json:"activity_type" validate:"required"`
	Description       string          `json:"description"`
	Geometry          json.RawMessage `json:"geometry" validate:"required"`
	Waypoints         json.RawMessage `json:"waypoints"`
	TotalDistance     float64         `json:"total_distance"`
	EstimatedDuration float64         `json:"estimated_duration"`
}

// UpdateRouteRequest is the payload for updating an existing route.
type UpdateRouteRequest struct {
	Name              *string          `json:"name"`
	ActivityType      *ActivityType    `json:"activity_type"`
	Description       *string          `json:"description"`
	Geometry          *json.RawMessage `json:"geometry"`
	Waypoints         *json.RawMessage `json:"waypoints"`
	TotalDistance     *float64         `json:"total_distance"`
	EstimatedDuration *float64         `json:"estimated_duration"`
}
