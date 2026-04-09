package repository

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"

	"github.com/babygramps/trailforge/internal/model"
)

// WaypointRepository handles persistence of waypoint records with plain lat/lon columns.
type WaypointRepository struct {
	db *DB
}

// NewWaypointRepository returns a new WaypointRepository.
func NewWaypointRepository(db *DB) *WaypointRepository {
	return &WaypointRepository{db: db}
}

// Create inserts a new waypoint.
func (r *WaypointRepository) Create(ctx context.Context, w *model.Waypoint) error {
	query := `
		INSERT INTO waypoints (user_id, name, description, lat, lon, ele, icon, color)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at`

	return r.db.Pool.QueryRow(ctx, query,
		w.UserID, w.Name, w.Description,
		w.Lat, w.Lon, w.Ele,
		w.Icon, w.Color,
	).Scan(&w.ID, &w.CreatedAt, &w.UpdatedAt)
}

// GetByID retrieves a waypoint by primary key.
func (r *WaypointRepository) GetByID(ctx context.Context, id string) (*model.Waypoint, error) {
	query := `
		SELECT
			id, user_id, name, description,
			lat, lon, ele, icon, color,
			created_at, updated_at
		FROM waypoints
		WHERE id = $1`

	w := &model.Waypoint{}
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&w.ID, &w.UserID, &w.Name, &w.Description,
		&w.Lat, &w.Lon, &w.Ele,
		&w.Icon, &w.Color,
		&w.CreatedAt, &w.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("waypoint not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying waypoint: %w", err)
	}
	return w, nil
}

// List returns a paginated slice of waypoints belonging to a user.
func (r *WaypointRepository) List(ctx context.Context, userID string, p model.Pagination) ([]model.Waypoint, error) {
	if p.Limit <= 0 {
		p.Limit = 50
	}
	query := `
		SELECT
			id, user_id, name, description,
			lat, lon, ele, icon, color,
			created_at, updated_at
		FROM waypoints
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.db.Pool.Query(ctx, query, userID, p.Limit, p.Offset)
	if err != nil {
		return nil, fmt.Errorf("listing waypoints: %w", err)
	}
	defer rows.Close()

	var waypoints []model.Waypoint
	for rows.Next() {
		var w model.Waypoint
		if err := rows.Scan(
			&w.ID, &w.UserID, &w.Name, &w.Description,
			&w.Lat, &w.Lon, &w.Ele,
			&w.Icon, &w.Color,
			&w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning waypoint row: %w", err)
		}
		waypoints = append(waypoints, w)
	}
	return waypoints, rows.Err()
}

// ListNear returns waypoints within a given radius (metres) of a point.
// Uses an approximate bounding-box filter in SQL then refines with Haversine in Go.
func (r *WaypointRepository) ListNear(ctx context.Context, userID string, lat, lon, radiusM float64, p model.Pagination) ([]model.Waypoint, error) {
	if p.Limit <= 0 {
		p.Limit = 50
	}

	// Approximate degree offset for the bounding box.
	latDelta := radiusM / 111320.0
	lonDelta := radiusM / (111320.0 * math.Cos(lat*math.Pi/180))

	query := `
		SELECT
			id, user_id, name, description,
			lat, lon, ele, icon, color,
			created_at, updated_at
		FROM waypoints
		WHERE user_id = $1
		  AND lat BETWEEN $2 AND $3
		  AND lon BETWEEN $4 AND $5
		ORDER BY created_at DESC`

	rows, err := r.db.Pool.Query(ctx, query,
		userID,
		lat-latDelta, lat+latDelta,
		lon-lonDelta, lon+lonDelta,
	)
	if err != nil {
		return nil, fmt.Errorf("listing nearby waypoints: %w", err)
	}
	defer rows.Close()

	var waypoints []model.Waypoint
	for rows.Next() {
		var w model.Waypoint
		if err := rows.Scan(
			&w.ID, &w.UserID, &w.Name, &w.Description,
			&w.Lat, &w.Lon, &w.Ele,
			&w.Icon, &w.Color,
			&w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning waypoint row: %w", err)
		}
		// Refine with Haversine distance check.
		if wpHaversine(lat, lon, w.Lat, w.Lon) <= radiusM {
			waypoints = append(waypoints, w)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Apply pagination.
	if p.Offset >= len(waypoints) {
		return nil, nil
	}
	end := p.Offset + p.Limit
	if end > len(waypoints) {
		end = len(waypoints)
	}
	return waypoints[p.Offset:end], nil
}

// Update modifies an existing waypoint.
func (r *WaypointRepository) Update(ctx context.Context, w *model.Waypoint) error {
	query := `
		UPDATE waypoints
		SET name = $2,
			description = $3,
			lat = $4,
			lon = $5,
			ele = $6,
			icon = $7,
			color = $8,
			updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	err := r.db.Pool.QueryRow(ctx, query,
		w.ID, w.Name, w.Description,
		w.Lat, w.Lon, w.Ele,
		w.Icon, w.Color,
	).Scan(&w.UpdatedAt)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("waypoint not found")
	}
	return err
}

// Delete removes a waypoint by ID.
func (r *WaypointRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM waypoints WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("deleting waypoint: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("waypoint not found")
	}
	return nil
}

// wpHaversine returns the distance in metres between two lat/lon points.
func wpHaversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
