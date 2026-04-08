//go:build integration

package repository

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/testdata"
)

func TestInteg_WaypointRepository_Create(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	wp := &model.Waypoint{
		UserID:      userID,
		Name:        "Half Dome",
		Description: "Iconic granite dome",
		Lat:         testdata.HalfDomeWaypointLat,
		Lon:         testdata.HalfDomeWaypointLon,
		Ele:         testdata.HalfDomeWaypointEle,
		Icon:        "peak",
		Color:       "#FF0000",
	}

	err := repo.Create(ctx, wp)
	require.NoError(t, err)

	assert.NotEmpty(t, wp.ID, "ID should be set")
	assert.Len(t, wp.ID, 36, "ID should be a UUID")
	assert.False(t, wp.CreatedAt.IsZero(), "CreatedAt should be set")
	assert.False(t, wp.UpdatedAt.IsZero(), "UpdatedAt should be set")
}

func TestInteg_WaypointRepository_GetByID(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	wp := &model.Waypoint{
		UserID:      userID,
		Name:        "Half Dome",
		Description: "Iconic granite dome",
		Lat:         testdata.HalfDomeWaypointLat,
		Lon:         testdata.HalfDomeWaypointLon,
		Ele:         testdata.HalfDomeWaypointEle,
		Icon:        "peak",
		Color:       "#FF0000",
	}
	require.NoError(t, repo.Create(ctx, wp))

	got, err := repo.GetByID(ctx, wp.ID)
	require.NoError(t, err)

	assert.Equal(t, wp.ID, got.ID)
	assert.Equal(t, userID, got.UserID)
	assert.Equal(t, "Half Dome", got.Name)
	assert.Equal(t, "Iconic granite dome", got.Description)
	assert.InDelta(t, testdata.HalfDomeWaypointLat, got.Lat, 0.0001,
		"latitude should match to 4 decimal places")
	assert.InDelta(t, testdata.HalfDomeWaypointLon, got.Lon, 0.0001,
		"longitude should match to 4 decimal places")
	assert.Equal(t, testdata.HalfDomeWaypointEle, got.Ele)
	assert.Equal(t, "peak", got.Icon)
	assert.Equal(t, "#FF0000", got.Color)
}

func TestInteg_WaypointRepository_ListNear(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	halfDome := &model.Waypoint{
		UserID:      userID,
		Name:        "Half Dome",
		Description: "Granite dome",
		Lat:         testdata.HalfDomeWaypointLat,
		Lon:         testdata.HalfDomeWaypointLon,
		Ele:         testdata.HalfDomeWaypointEle,
		Icon:        "peak",
		Color:       "#FF0000",
	}
	require.NoError(t, repo.Create(ctx, halfDome))

	elCapitan := &model.Waypoint{
		UserID:      userID,
		Name:        "El Capitan",
		Description: "Vertical rock formation",
		Lat:         testdata.ElCapitanWaypointLat,
		Lon:         testdata.ElCapitanWaypointLon,
		Ele:         testdata.ElCapitanWaypointEle,
		Icon:        "peak",
		Color:       "#00FF00",
	}
	require.NoError(t, repo.Create(ctx, elCapitan))

	nycWP := &model.Waypoint{
		UserID:      userID,
		Name:        "Central Park",
		Description: "NYC park",
		Lat:         40.7831,
		Lon:         -73.9712,
		Ele:         25.0,
		Icon:        "park",
		Color:       "#0000FF",
	}
	require.NoError(t, repo.Create(ctx, nycWP))

	// Query within 20 km of Half Dome — El Capitan (~10 km away) should be
	// returned, but NYC (~4000 km away) should not.
	results, err := repo.ListNear(ctx, userID,
		testdata.HalfDomeWaypointLat, testdata.HalfDomeWaypointLon,
		20_000, // 20 km
		model.Pagination{Limit: 50},
	)
	require.NoError(t, err)

	names := make(map[string]bool)
	for _, w := range results {
		names[w.Name] = true
	}
	assert.True(t, names["Half Dome"], "Half Dome should be in near results")
	assert.True(t, names["El Capitan"], "El Capitan should be in near results")
	assert.False(t, names["Central Park"], "NYC waypoint should NOT be in near results")
}

func TestInteg_WaypointRepository_List_UserIsolation(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	user1 := createTestUser(ctx, t, db)
	user2 := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	wp1 := &model.Waypoint{
		UserID: user1,
		Name:   "User1 Point",
		Lat:    37.7459,
		Lon:    -119.5332,
		Ele:    100,
		Icon:   "marker",
		Color:  "#FF0000",
	}
	require.NoError(t, repo.Create(ctx, wp1))

	wp2 := &model.Waypoint{
		UserID: user2,
		Name:   "User2 Point",
		Lat:    40.7831,
		Lon:    -73.9712,
		Ele:    25,
		Icon:   "marker",
		Color:  "#0000FF",
	}
	require.NoError(t, repo.Create(ctx, wp2))

	list1, err := repo.List(ctx, user1, model.Pagination{Limit: 50})
	require.NoError(t, err)
	assert.Len(t, list1, 1)
	assert.Equal(t, "User1 Point", list1[0].Name)

	list2, err := repo.List(ctx, user2, model.Pagination{Limit: 50})
	require.NoError(t, err)
	assert.Len(t, list2, 1)
	assert.Equal(t, "User2 Point", list2[0].Name)
}

func TestInteg_WaypointRepository_Update(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	wp := &model.Waypoint{
		UserID:      userID,
		Name:        "Old Name",
		Description: "Old desc",
		Lat:         testdata.HalfDomeWaypointLat,
		Lon:         testdata.HalfDomeWaypointLon,
		Ele:         testdata.HalfDomeWaypointEle,
		Icon:        "marker",
		Color:       "#FF0000",
	}
	require.NoError(t, repo.Create(ctx, wp))

	wp.Name = "New Name"
	wp.Lat = testdata.ElCapitanWaypointLat
	wp.Lon = testdata.ElCapitanWaypointLon
	require.NoError(t, repo.Update(ctx, wp))

	got, err := repo.GetByID(ctx, wp.ID)
	require.NoError(t, err)
	assert.Equal(t, "New Name", got.Name)
	assert.InDelta(t, testdata.ElCapitanWaypointLat, got.Lat, 0.0001)
	assert.InDelta(t, testdata.ElCapitanWaypointLon, got.Lon, 0.0001)
}

func TestInteg_WaypointRepository_Delete(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userID := createTestUser(ctx, t, db)
	repo := NewWaypointRepository(db)

	wp := &model.Waypoint{
		UserID: userID,
		Name:   "Doomed Waypoint",
		Lat:    testdata.HalfDomeWaypointLat,
		Lon:    testdata.HalfDomeWaypointLon,
		Ele:    testdata.HalfDomeWaypointEle,
		Icon:   "marker",
		Color:  "#FF0000",
	}
	require.NoError(t, repo.Create(ctx, wp))

	err := repo.Delete(ctx, wp.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, wp.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
