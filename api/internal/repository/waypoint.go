package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/babygramps/trailforge/internal/model"
)

// WaypointRepository handles persistence of waypoint records with PostGIS geography.
type WaypointRepository struct {
	db *DB
}

// NewWaypointRepository returns a new WaypointRepository.
func NewWaypointRepository(db *DB) *WaypointRepository {
	return &WaypointRepository{db: db}
}

// Create inserts a new waypoint, storing its position as a PostGIS geography point.
func (r *WaypointRepository) Create(ctx context.Context, w *model.Waypoint) error {
	query := `
		INSERT INTO waypoints (user_id, name, description, location, ele, icon, color)
		VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8)
		RETURNING id, created_at, updated_at`

	return r.db.Pool.QueryRow(ctx, query,
		w.UserID, w.Name, w.Description,
		w.Lon, w.Lat, w.Ele,
		w.Icon, w.Color,
	).Scan(&w.ID, &w.CreatedAt, &w.UpdatedAt)
}

// GetByID retrieves a waypoint by primary key.
func (r *WaypointRepository) GetByID(ctx context.Context, id string) (*model.Waypoint, error) {
	query := `
		SELECT
			id, user_id, name, description,
			ST_Y(location::geometry) AS lat,
			ST_X(location::geometry) AS lon,
			ele, icon, color,
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
			ST_Y(location::geometry) AS lat,
			ST_X(location::geometry) AS lon,
			ele, icon, color,
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
func (r *WaypointRepository) ListNear(ctx context.Context, userID string, lat, lon, radiusM float64, p model.Pagination) ([]model.Waypoint, error) {
	if p.Limit <= 0 {
		p.Limit = 50
	}
	query := `
		SELECT
			id, user_id, name, description,
			ST_Y(location::geometry) AS lat,
			ST_X(location::geometry) AS lon,
			ele, icon, color,
			created_at, updated_at
		FROM waypoints
		WHERE user_id = $1
		  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
		ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
		LIMIT $5 OFFSET $6`

	rows, err := r.db.Pool.Query(ctx, query, userID, lon, lat, radiusM, p.Limit, p.Offset)
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
		waypoints = append(waypoints, w)
	}
	return waypoints, rows.Err()
}

// Update modifies an existing waypoint.
func (r *WaypointRepository) Update(ctx context.Context, w *model.Waypoint) error {
	query := `
		UPDATE waypoints
		SET name = $2,
			description = $3,
			location = ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
			ele = $6,
			icon = $7,
			color = $8,
			updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	err := r.db.Pool.QueryRow(ctx, query,
		w.ID, w.Name, w.Description,
		w.Lon, w.Lat, w.Ele,
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
