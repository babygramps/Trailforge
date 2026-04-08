//go:build integration

package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/testdata"
)

// yosemiteGeometry extracts just the "geometry" object from the Yosemite
// Feature GeoJSON so it can be stored via ST_GeomFromGeoJSON.
func yosemiteGeometry(tb testing.TB) json.RawMessage {
	tb.Helper()
	var feat struct {
		Geometry json.RawMessage `json:"geometry"`
	}
	require.NoError(tb, json.Unmarshal([]byte(testdata.YosemiteTrailGeoJSON), &feat))
	return feat.Geometry
}

// nycGeometry extracts just the "geometry" object from the NYC Feature GeoJSON.
func nycGeometry(tb testing.TB) json.RawMessage {
	tb.Helper()
	var feat struct {
		Geometry json.RawMessage `json:"geometry"`
	}
	require.NoError(tb, json.Unmarshal([]byte(testdata.NYCPointGeoJSON), &feat))
	return feat.Geometry
}

func TestInteg_TrackRepository_Create(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Yosemite Valley Loop",
		ActivityType: model.ActivityHike,
		Description:  "Morning hike",
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(testdata.YosemiteTrackStats),
	}

	err := repo.Create(ctx, track)
	require.NoError(t, err)

	assert.NotEmpty(t, track.ID, "ID should be set")
	assert.Len(t, track.ID, 36, "ID should be a UUID (36 chars with dashes)")
	assert.False(t, track.CreatedAt.IsZero(), "CreatedAt should be set")
	assert.False(t, track.UpdatedAt.IsZero(), "UpdatedAt should be set")
}

func TestInteg_TrackRepository_GetByID(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Yosemite Valley Loop",
		ActivityType: model.ActivityHike,
		Description:  "Morning hike",
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(testdata.YosemiteTrackStats),
	}
	require.NoError(t, repo.Create(ctx, track))

	got, err := repo.GetByID(ctx, track.ID)
	require.NoError(t, err)

	assert.Equal(t, track.ID, got.ID)
	assert.Equal(t, userID, got.UserID)
	assert.Equal(t, "Yosemite Valley Loop", got.Name)
	assert.Equal(t, model.ActivityHike, got.ActivityType)
	assert.Equal(t, "Morning hike", got.Description)
	assert.NotNil(t, got.Geometry, "Geometry should be returned as GeoJSON")
	assert.NotNil(t, got.Stats, "Stats should be returned")
	assert.WithinDuration(t, track.CreatedAt, got.CreatedAt, time.Second)
	assert.WithinDuration(t, track.UpdatedAt, got.UpdatedAt, time.Second)
}

func TestInteg_TrackRepository_GetByID_NotFound(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewTrackRepository(db)

	_, err := repo.GetByID(ctx, "00000000-0000-0000-0000-000000000000")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestInteg_TrackRepository_List_Pagination(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	for i := 0; i < 5; i++ {
		tr := &model.Track{
			UserID:       userID,
			Name:         fmt.Sprintf("Track %d", i),
			ActivityType: model.ActivityHike,
			Geometry:     yosemiteGeometry(t),
			Stats:        json.RawMessage(`{}`),
		}
		require.NoError(t, repo.Create(ctx, tr))
	}

	tracks, err := repo.List(ctx, userID, model.Pagination{Limit: 2, Offset: 0})
	require.NoError(t, err)
	assert.Len(t, tracks, 2, "should return exactly 2 tracks with Limit=2")
}

func TestInteg_TrackRepository_List_UserIsolation(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	user1 := createTestUser(ctx, t, db)
	user2 := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	for i := 0; i < 3; i++ {
		tr := &model.Track{
			UserID:       user1,
			Name:         fmt.Sprintf("User1 Track %d", i),
			ActivityType: model.ActivityHike,
			Geometry:     yosemiteGeometry(t),
			Stats:        json.RawMessage(`{}`),
		}
		require.NoError(t, repo.Create(ctx, tr))
	}
	for i := 0; i < 2; i++ {
		tr := &model.Track{
			UserID:       user2,
			Name:         fmt.Sprintf("User2 Track %d", i),
			ActivityType: model.ActivityBike,
			Geometry:     nycGeometry(t),
			Stats:        json.RawMessage(`{}`),
		}
		require.NoError(t, repo.Create(ctx, tr))
	}

	tracks1, err := repo.List(ctx, user1, model.Pagination{Limit: 50})
	require.NoError(t, err)
	assert.Len(t, tracks1, 3, "user1 should see only their 3 tracks")

	tracks2, err := repo.List(ctx, user2, model.Pagination{Limit: 50})
	require.NoError(t, err)
	assert.Len(t, tracks2, 2, "user2 should see only their 2 tracks")
}

func TestInteg_TrackRepository_ListInBounds(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	yosemite := &model.Track{
		UserID:       userID,
		Name:         "Yosemite Trail",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, yosemite))

	nyc := &model.Track{
		UserID:       userID,
		Name:         "NYC Central Park",
		ActivityType: model.ActivityHike,
		Geometry:     nycGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, nyc))

	// Bounding box that covers Yosemite but not NYC.
	bbox := model.BBox{
		MinLon: -119.6,
		MinLat: 37.7,
		MaxLon: -119.5,
		MaxLat: 37.8,
	}
	tracks, err := repo.ListInBounds(ctx, userID, bbox, model.Pagination{Limit: 50})
	require.NoError(t, err)

	assert.Len(t, tracks, 1, "only Yosemite track should be in bounds")
	assert.Equal(t, "Yosemite Trail", tracks[0].Name)
}

func TestInteg_TrackRepository_Update(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Original Name",
		ActivityType: model.ActivityHike,
		Description:  "Original desc",
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	track.Name = "Updated Name"
	require.NoError(t, repo.Update(ctx, track))

	got, err := repo.GetByID(ctx, track.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", got.Name)
}

func TestInteg_TrackRepository_Delete(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Doomed Track",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	err := repo.Delete(ctx, track.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, track.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestInteg_TrackRepository_Delete_NotFound(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewTrackRepository(db)

	err := repo.Delete(ctx, "00000000-0000-0000-0000-000000000000")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestInteg_TrackRepository_AppendPoints(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Append Test",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	// Retrieve original to count coordinates.
	original, err := repo.GetByID(ctx, track.ID)
	require.NoError(t, err)

	var origGeom struct {
		Coordinates []json.RawMessage `json:"coordinates"`
	}
	require.NoError(t, json.Unmarshal(original.Geometry, &origGeom))
	origCount := len(origGeom.Coordinates)

	// Append 3 new points.
	newPoints := []model.Point{
		{Lat: 37.7630, Lon: -119.5878, Ele: 1220.0},
		{Lat: 37.7632, Lon: -119.5875, Ele: 1215.0},
		{Lat: 37.7634, Lon: -119.5872, Ele: 1210.0},
	}
	require.NoError(t, repo.AppendPoints(ctx, track.ID, newPoints))

	// Retrieve and verify coordinate count increased.
	updated, err := repo.GetByID(ctx, track.ID)
	require.NoError(t, err)

	var updatedGeom struct {
		Coordinates []json.RawMessage `json:"coordinates"`
	}
	require.NoError(t, json.Unmarshal(updated.Geometry, &updatedGeom))
	assert.Equal(t, origCount+3, len(updatedGeom.Coordinates),
		"coordinate count should increase by 3 after append")
}

func TestInteg_TrackRepository_AppendPoints_EmptySlice(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Empty Append",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	err := repo.AppendPoints(ctx, track.ID, []model.Point{})
	assert.NoError(t, err, "appending empty slice should not error")
}

func TestInteg_TrackRepository_GetLength(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Length Test",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	length, err := repo.GetLength(ctx, track.ID)
	require.NoError(t, err)
	assert.Greater(t, length, 1500.0, "Yosemite trail should be > 1500m")
	assert.Less(t, length, 2500.0, "Yosemite trail should be < 2500m")
}

func TestInteg_TrackRepository_GetBounds(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewTrackRepository(db)

	track := &model.Track{
		UserID:       userID,
		Name:         "Bounds Test",
		ActivityType: model.ActivityHike,
		Geometry:     yosemiteGeometry(t),
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, repo.Create(ctx, track))

	bounds, err := repo.GetBounds(ctx, track.ID)
	require.NoError(t, err)
	require.NotNil(t, bounds)

	var geojson struct {
		Type string `json:"type"`
	}
	require.NoError(t, json.Unmarshal(bounds, &geojson))
	assert.Equal(t, "Polygon", geojson.Type, "bounds should be a Polygon GeoJSON")
}
