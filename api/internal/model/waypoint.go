package model

import (
	"time"
)

// Waypoint represents a named point of interest on a map.
type Waypoint struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Lat         float64   `json:"lat"`
	Lon         float64   `json:"lon"`
	Ele         float64   `json:"ele"`
	Icon        string    `json:"icon"`
	Color       string    `json:"color"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CreateWaypointRequest is the payload for creating a new waypoint.
type CreateWaypointRequest struct {
	Name        string  `json:"name" validate:"required"`
	Description string  `json:"description"`
	Lat         float64 `json:"lat" validate:"required"`
	Lon         float64 `json:"lon" validate:"required"`
	Ele         float64 `json:"ele"`
	Icon        string  `json:"icon"`
	Color       string  `json:"color"`
}

// UpdateWaypointRequest is the payload for updating an existing waypoint.
type UpdateWaypointRequest struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	Lat         *float64 `json:"lat"`
	Lon         *float64 `json:"lon"`
	Ele         *float64 `json:"ele"`
	Icon        *string  `json:"icon"`
	Color       *string  `json:"color"`
}
