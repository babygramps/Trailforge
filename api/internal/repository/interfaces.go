package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/babygramps/trailforge/internal/model"
)

// TrackRepo defines the interface for track persistence operations.
type TrackRepo interface {
	Create(ctx context.Context, t *model.Track) error
	GetByID(ctx context.Context, id string) (*model.Track, error)
	List(ctx context.Context, userID string, p model.Pagination) ([]model.Track, error)
	ListInBounds(ctx context.Context, userID string, bbox model.BBox, p model.Pagination) ([]model.Track, error)
	Update(ctx context.Context, t *model.Track) error
	Delete(ctx context.Context, id string) error
	AppendPoints(ctx context.Context, trackID string, points []model.Point) error
	GetLength(ctx context.Context, id string) (float64, error)
	GetBounds(ctx context.Context, id string) (json.RawMessage, error)
}

// UserRepo defines the interface for user persistence operations.
type UserRepo interface {
	Create(ctx context.Context, u *model.User) error
	GetByID(ctx context.Context, id string) (*model.User, error)
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	List(ctx context.Context, limit, offset int) ([]model.User, error)
	Update(ctx context.Context, u *model.User) error
	Delete(ctx context.Context, id string) error
	CreatePasswordResetToken(ctx context.Context, userID, token string, expiresAt time.Time) error
	ValidatePasswordResetToken(ctx context.Context, token string) (string, error)
	ConsumePasswordResetToken(ctx context.Context, token string) error
}

// WaypointRepo defines the interface for waypoint persistence operations.
type WaypointRepo interface {
	Create(ctx context.Context, w *model.Waypoint) error
	GetByID(ctx context.Context, id string) (*model.Waypoint, error)
	List(ctx context.Context, userID string, p model.Pagination) ([]model.Waypoint, error)
	ListNear(ctx context.Context, userID string, lat, lon, radiusM float64, p model.Pagination) ([]model.Waypoint, error)
	Update(ctx context.Context, w *model.Waypoint) error
	Delete(ctx context.Context, id string) error
}
