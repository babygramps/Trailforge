package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/babygramps/trailforge/internal/model"
)

// TrackRepository handles persistence of GPS tracks with PostGIS geometry.
type TrackRepository struct {
	db *DB
}

// NewTrackRepository returns a new TrackRepository.
func NewTrackRepository(db *DB) *TrackRepository {
	return &TrackRepository{db: db}
}

// Create inserts a new track, storing geometry via ST_GeomFromGeoJSON.
func (r *TrackRepository) Create(ctx context.Context, t *model.Track) error {
	query := `
		INSERT INTO tracks (user_id, name, activity_type, description, geometry, stats)
		VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6)
		RETURNING id, created_at, updated_at`

	geomJSON := string(t.Geometry)
	statsJSON := "{}"
	if len(t.Stats) > 0 {
		statsJSON = string(t.Stats)
	}

	return r.db.Pool.QueryRow(ctx, query,
		t.UserID, t.Name, t.ActivityType, t.Description,
		geomJSON, statsJSON,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

// GetByID retrieves a single track, returning geometry as GeoJSON.
func (r *TrackRepository) GetByID(ctx context.Context, id string) (*model.Track, error) {
	query := `
		SELECT
			t.id, t.user_id, t.name, t.activity_type, t.description,
			ST_AsGeoJSON(t.geometry)::jsonb,
			t.stats,
			t.created_at, t.updated_at
		FROM tracks t
		WHERE t.id = $1`

	t := &model.Track{}
	var geom, stats []byte
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.UserID, &t.Name, &t.ActivityType, &t.Description,
		&geom, &stats,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("track not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying track: %w", err)
	}
	t.Geometry = json.RawMessage(geom)
	t.Stats = json.RawMessage(stats)
	return t, nil
}

// List returns a paginated slice of tracks belonging to a user.
func (r *TrackRepository) List(ctx context.Context, userID string, p model.Pagination) ([]model.Track, error) {
	if p.Limit <= 0 {
		p.Limit = 50
	}
	query := `
		SELECT
			id, user_id, name, activity_type, description,
			ST_AsGeoJSON(geometry)::jsonb,
			stats,
			created_at, updated_at
		FROM tracks
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.db.Pool.Query(ctx, query, userID, p.Limit, p.Offset)
	if err != nil {
		return nil, fmt.Errorf("listing tracks: %w", err)
	}
	defer rows.Close()

	var tracks []model.Track
	for rows.Next() {
		var t model.Track
		var geom, stats []byte
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.Name, &t.ActivityType, &t.Description,
			&geom, &stats,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning track row: %w", err)
		}
		t.Geometry = json.RawMessage(geom)
		t.Stats = json.RawMessage(stats)
		tracks = append(tracks, t)
	}
	return tracks, rows.Err()
}

// ListInBounds returns tracks whose geometry intersects the given bounding box.
func (r *TrackRepository) ListInBounds(ctx context.Context, userID string, bbox model.BBox, p model.Pagination) ([]model.Track, error) {
	if p.Limit <= 0 {
		p.Limit = 50
	}
	query := `
		SELECT
			id, user_id, name, activity_type, description,
			ST_AsGeoJSON(geometry)::jsonb,
			stats,
			created_at, updated_at
		FROM tracks
		WHERE user_id = $1
		  AND ST_Intersects(
				geometry,
				ST_MakeEnvelope($2, $3, $4, $5, 4326)
			)
		ORDER BY created_at DESC
		LIMIT $6 OFFSET $7`

	rows, err := r.db.Pool.Query(ctx, query,
		userID,
		bbox.MinLon, bbox.MinLat, bbox.MaxLon, bbox.MaxLat,
		p.Limit, p.Offset,
	)
	if err != nil {
		return nil, fmt.Errorf("listing tracks in bounds: %w", err)
	}
	defer rows.Close()

	var tracks []model.Track
	for rows.Next() {
		var t model.Track
		var geom, stats []byte
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.Name, &t.ActivityType, &t.Description,
			&geom, &stats,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning track row: %w", err)
		}
		t.Geometry = json.RawMessage(geom)
		t.Stats = json.RawMessage(stats)
		tracks = append(tracks, t)
	}
	return tracks, rows.Err()
}

// Update modifies an existing track. Only non-nil fields in the request are changed.
func (r *TrackRepository) Update(ctx context.Context, t *model.Track) error {
	query := `
		UPDATE tracks
		SET name = $2,
			activity_type = $3,
			description = $4,
			geometry = ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
			stats = $6,
			updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	err := r.db.Pool.QueryRow(ctx, query,
		t.ID, t.Name, t.ActivityType, t.Description,
		string(t.Geometry), string(t.Stats),
	).Scan(&t.UpdatedAt)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("track not found")
	}
	return err
}

// Delete removes a track by ID.
func (r *TrackRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM tracks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("deleting track: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("track not found")
	}
	return nil
}

// AppendPoints extends an existing track geometry with additional GPS points.
// It uses ST_MakeLine to concatenate the existing geometry with the new points.
func (r *TrackRepository) AppendPoints(ctx context.Context, trackID string, points []model.Point) error {
	if len(points) == 0 {
		return nil
	}

	// Build a LINESTRING Z from the new points.
	coordsSQL := "ARRAY["
	args := []any{trackID}
	for i, pt := range points {
		if i > 0 {
			coordsSQL += ","
		}
		argBase := i*3 + 2
		coordsSQL += fmt.Sprintf("ST_MakePoint($%d, $%d, $%d)", argBase, argBase+1, argBase+2)
		args = append(args, pt.Lon, pt.Lat, pt.Ele)
	}
	coordsSQL += "]"

	query := fmt.Sprintf(`
		UPDATE tracks
		SET geometry = ST_SetSRID(
			ST_MakeLine(geometry, ST_MakeLine(%s)),
			4326
		),
		updated_at = NOW()
		WHERE id = $1`, coordsSQL)

	tag, err := r.db.Pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("appending points: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("track not found")
	}
	return nil
}

// GetLength returns the geographic length of a track in metres.
func (r *TrackRepository) GetLength(ctx context.Context, id string) (float64, error) {
	var length float64
	err := r.db.Pool.QueryRow(ctx,
		`SELECT ST_Length(geometry::geography) FROM tracks WHERE id = $1`, id,
	).Scan(&length)
	if err == pgx.ErrNoRows {
		return 0, fmt.Errorf("track not found")
	}
	return length, err
}

// GetBounds returns the bounding box envelope of a track as GeoJSON.
func (r *TrackRepository) GetBounds(ctx context.Context, id string) (json.RawMessage, error) {
	var geojson []byte
	err := r.db.Pool.QueryRow(ctx,
		`SELECT ST_AsGeoJSON(ST_Envelope(geometry))::jsonb FROM tracks WHERE id = $1`, id,
	).Scan(&geojson)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("track not found")
	}
	return json.RawMessage(geojson), err
}
