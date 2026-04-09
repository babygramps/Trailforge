package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"

	"github.com/babygramps/trailforge/internal/model"
)

// TrackRepository handles persistence of GPS tracks with JSONB geometry.
type TrackRepository struct {
	db *DB
}

// NewTrackRepository returns a new TrackRepository.
func NewTrackRepository(db *DB) *TrackRepository {
	return &TrackRepository{db: db}
}

// Create inserts a new track, storing geometry as JSONB.
func (r *TrackRepository) Create(ctx context.Context, t *model.Track) error {
	query := `
		INSERT INTO tracks (user_id, name, activity_type, description, geometry, stats)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
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

// GetByID retrieves a single track, returning geometry as stored JSONB.
func (r *TrackRepository) GetByID(ctx context.Context, id string) (*model.Track, error) {
	query := `
		SELECT
			t.id, t.user_id, t.name, t.activity_type, t.description,
			t.geometry,
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
			geometry,
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

// ListInBounds returns tracks belonging to the user.
// Without PostGIS, spatial filtering is not performed server-side;
// all tracks are returned and the client filters by visible bounds.
func (r *TrackRepository) ListInBounds(ctx context.Context, userID string, bbox model.BBox, p model.Pagination) ([]model.Track, error) {
	return r.List(ctx, userID, p)
}

// Update modifies an existing track.
func (r *TrackRepository) Update(ctx context.Context, t *model.Track) error {
	query := `
		UPDATE tracks
		SET name = $2,
			activity_type = $3,
			description = $4,
			geometry = $5::jsonb,
			stats = $6::jsonb,
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
// It reads the current GeoJSON, appends coordinates in Go, and writes back.
func (r *TrackRepository) AppendPoints(ctx context.Context, trackID string, points []model.Point) error {
	if len(points) == 0 {
		return nil
	}

	// Read current geometry.
	var geomBytes []byte
	err := r.db.Pool.QueryRow(ctx,
		`SELECT geometry FROM tracks WHERE id = $1`, trackID,
	).Scan(&geomBytes)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("track not found")
	}
	if err != nil {
		return fmt.Errorf("reading track geometry: %w", err)
	}

	// Parse existing GeoJSON or start fresh.
	type geojson struct {
		Type        string      `json:"type"`
		Coordinates [][]float64 `json:"coordinates"`
	}
	var geom geojson
	if len(geomBytes) > 0 && string(geomBytes) != "null" {
		if err := json.Unmarshal(geomBytes, &geom); err != nil {
			return fmt.Errorf("parsing existing geometry: %w", err)
		}
	}
	if geom.Type == "" {
		geom.Type = "LineString"
	}

	// Append new points.
	for _, pt := range points {
		geom.Coordinates = append(geom.Coordinates, []float64{pt.Lon, pt.Lat, pt.Ele})
	}

	updatedJSON, err := json.Marshal(geom)
	if err != nil {
		return fmt.Errorf("marshalling updated geometry: %w", err)
	}

	tag, err := r.db.Pool.Exec(ctx,
		`UPDATE tracks SET geometry = $2::jsonb, updated_at = NOW() WHERE id = $1`,
		trackID, string(updatedJSON),
	)
	if err != nil {
		return fmt.Errorf("appending points: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("track not found")
	}
	return nil
}

// GetLength returns the geographic length of a track in metres,
// computed via the Haversine formula over the GeoJSON coordinates.
func (r *TrackRepository) GetLength(ctx context.Context, id string) (float64, error) {
	var geomBytes []byte
	err := r.db.Pool.QueryRow(ctx,
		`SELECT geometry FROM tracks WHERE id = $1`, id,
	).Scan(&geomBytes)
	if err == pgx.ErrNoRows {
		return 0, fmt.Errorf("track not found")
	}
	if err != nil {
		return 0, err
	}

	type geojson struct {
		Coordinates [][]float64 `json:"coordinates"`
	}
	var geom geojson
	if err := json.Unmarshal(geomBytes, &geom); err != nil {
		return 0, nil
	}

	var total float64
	for i := 1; i < len(geom.Coordinates); i++ {
		prev := geom.Coordinates[i-1]
		cur := geom.Coordinates[i]
		if len(prev) >= 2 && len(cur) >= 2 {
			total += haversine(prev[1], prev[0], cur[1], cur[0])
		}
	}
	return total, nil
}

// GetBounds returns the bounding box envelope of a track as GeoJSON Polygon.
func (r *TrackRepository) GetBounds(ctx context.Context, id string) (json.RawMessage, error) {
	var geomBytes []byte
	err := r.db.Pool.QueryRow(ctx,
		`SELECT geometry FROM tracks WHERE id = $1`, id,
	).Scan(&geomBytes)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("track not found")
	}
	if err != nil {
		return nil, err
	}

	type geojson struct {
		Coordinates [][]float64 `json:"coordinates"`
	}
	var geom geojson
	if err := json.Unmarshal(geomBytes, &geom); err != nil {
		return nil, fmt.Errorf("parsing geometry: %w", err)
	}

	if len(geom.Coordinates) == 0 {
		return json.RawMessage(`null`), nil
	}

	minLon, minLat := geom.Coordinates[0][0], geom.Coordinates[0][1]
	maxLon, maxLat := minLon, minLat
	for _, c := range geom.Coordinates[1:] {
		if len(c) < 2 {
			continue
		}
		if c[0] < minLon {
			minLon = c[0]
		}
		if c[0] > maxLon {
			maxLon = c[0]
		}
		if c[1] < minLat {
			minLat = c[1]
		}
		if c[1] > maxLat {
			maxLat = c[1]
		}
	}

	envelope := map[string]any{
		"type": "Polygon",
		"coordinates": [][][]float64{{
			{minLon, minLat},
			{minLon, maxLat},
			{maxLon, maxLat},
			{maxLon, minLat},
			{minLon, minLat},
		}},
	}
	return json.Marshal(envelope)
}

// haversine returns the distance in metres between two lat/lon points.
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in metres
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
