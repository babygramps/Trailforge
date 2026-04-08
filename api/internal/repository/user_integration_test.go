//go:build integration

package repository

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/testdata"
)

func TestInteg_UserRepository_Create(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user := &model.User{
		Email:        testdata.TestUserEmail,
		PasswordHash: "hashed_password_123",
		DisplayName:  testdata.TestUserDisplayName,
	}

	err := repo.Create(ctx, user)
	require.NoError(t, err)

	assert.NotEmpty(t, user.ID, "ID should be populated")
	assert.Len(t, user.ID, 36, "ID should be a UUID")
	assert.False(t, user.CreatedAt.IsZero(), "CreatedAt should be set")
	assert.False(t, user.UpdatedAt.IsZero(), "UpdatedAt should be set")
}

func TestInteg_UserRepository_Create_DuplicateEmail(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user1 := &model.User{
		Email:        "dupe@test.io",
		PasswordHash: "hash1",
		DisplayName:  "First",
	}
	require.NoError(t, repo.Create(ctx, user1))

	user2 := &model.User{
		Email:        "dupe@test.io",
		PasswordHash: "hash2",
		DisplayName:  "Second",
	}
	err := repo.Create(ctx, user2)
	require.Error(t, err, "duplicate email should fail")
}

func TestInteg_UserRepository_GetByID(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user := &model.User{
		Email:        "getbyid@test.io",
		PasswordHash: "hashed",
		DisplayName:  "Lookup User",
	}
	require.NoError(t, repo.Create(ctx, user))

	got, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)

	assert.Equal(t, user.ID, got.ID)
	assert.Equal(t, "getbyid@test.io", got.Email)
	assert.Equal(t, "hashed", got.PasswordHash)
	assert.Equal(t, "Lookup User", got.DisplayName)
	assert.WithinDuration(t, user.CreatedAt, got.CreatedAt, time.Second)
	assert.WithinDuration(t, user.UpdatedAt, got.UpdatedAt, time.Second)
}

func TestInteg_UserRepository_GetByEmail(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user := &model.User{
		Email:        "findme@test.io",
		PasswordHash: "hashed",
		DisplayName:  "Find Me",
	}
	require.NoError(t, repo.Create(ctx, user))

	got, err := repo.GetByEmail(ctx, "findme@test.io")
	require.NoError(t, err)
	assert.Equal(t, user.ID, got.ID)
	assert.Equal(t, "findme@test.io", got.Email)
}

func TestInteg_UserRepository_Update(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user := &model.User{
		Email:        "update@test.io",
		PasswordHash: "hashed",
		DisplayName:  "Original Name",
	}
	require.NoError(t, repo.Create(ctx, user))

	user.DisplayName = "Updated Name"
	require.NoError(t, repo.Update(ctx, user))

	got, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", got.DisplayName)
	assert.True(t, got.UpdatedAt.After(got.CreatedAt) || got.UpdatedAt.Equal(got.CreatedAt),
		"UpdatedAt should be >= CreatedAt after update")
}

func TestInteg_UserRepository_Delete(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := NewUserRepository(db)

	user := &model.User{
		Email:        "delete@test.io",
		PasswordHash: "hashed",
		DisplayName:  "Doomed",
	}
	require.NoError(t, repo.Create(ctx, user))

	err := repo.Delete(ctx, user.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, user.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestInteg_UserRepository_Delete_CascadesTracks(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	userRepo := NewUserRepository(db)
	trackRepo := NewTrackRepository(db)

	user := &model.User{
		Email:        "cascade@test.io",
		PasswordHash: "hashed",
		DisplayName:  "Cascade Test",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	// Extract geometry from the Yosemite fixture for the track.
	var feat struct {
		Geometry json.RawMessage `json:"geometry"`
	}
	require.NoError(t, json.Unmarshal([]byte(testdata.YosemiteTrailGeoJSON), &feat))

	track := &model.Track{
		UserID:       user.ID,
		Name:         "Cascade Track",
		ActivityType: model.ActivityHike,
		Geometry:     feat.Geometry,
		Stats:        json.RawMessage(`{}`),
	}
	require.NoError(t, trackRepo.Create(ctx, track))

	// Delete the user; ON DELETE CASCADE should remove the track.
	require.NoError(t, userRepo.Delete(ctx, user.ID))

	_, err := trackRepo.GetByID(ctx, track.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
