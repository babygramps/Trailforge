package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/babygramps/trailforge/internal/model"
)

// UserRepository handles persistence of user records.
type UserRepository struct {
	db *DB
}

// NewUserRepository returns a new UserRepository.
func NewUserRepository(db *DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a new user and returns the populated record.
func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	query := `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at`

	return r.db.Pool.QueryRow(ctx, query,
		u.Email, u.PasswordHash, u.DisplayName,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
}

// GetByID retrieves a user by primary key.
func (r *UserRepository) GetByID(ctx context.Context, id string) (*model.User, error) {
	query := `
		SELECT id, email, password_hash, display_name, created_at, updated_at
		FROM users
		WHERE id = $1`

	u := &model.User{}
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying user: %w", err)
	}
	return u, nil
}

// GetByEmail retrieves a user by email address.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	query := `
		SELECT id, email, password_hash, display_name, created_at, updated_at
		FROM users
		WHERE email = $1`

	u := &model.User{}
	err := r.db.Pool.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying user by email: %w", err)
	}
	return u, nil
}

// List returns a paginated slice of users.
func (r *UserRepository) List(ctx context.Context, limit, offset int) ([]model.User, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT id, email, password_hash, display_name, created_at, updated_at
		FROM users
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2`

	rows, err := r.db.Pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(
			&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName,
			&u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning user row: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// Update modifies mutable user fields.
func (r *UserRepository) Update(ctx context.Context, u *model.User) error {
	query := `
		UPDATE users
		SET email = $2, display_name = $3, password_hash = $4, updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	err := r.db.Pool.QueryRow(ctx, query,
		u.ID, u.Email, u.DisplayName, u.PasswordHash,
	).Scan(&u.UpdatedAt)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("user not found")
	}
	return err
}

// Delete removes a user by ID.
func (r *UserRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// CreatePasswordResetToken stores a reset token for the given user.
func (r *UserRepository) CreatePasswordResetToken(ctx context.Context, userID, token string, expiresAt time.Time) error {
	// Invalidate any existing unused tokens for this user
	_, _ = r.db.Pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, userID)

	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, token, expiresAt)
	if err != nil {
		return fmt.Errorf("creating reset token: %w", err)
	}
	return nil
}

// ValidatePasswordResetToken checks that a token is valid and returns the user ID.
func (r *UserRepository) ValidatePasswordResetToken(ctx context.Context, token string) (string, error) {
	var userID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT user_id FROM password_reset_tokens
		 WHERE token = $1 AND used = FALSE AND expires_at > NOW()`, token).Scan(&userID)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("invalid or expired reset token")
	}
	if err != nil {
		return "", fmt.Errorf("validating reset token: %w", err)
	}
	return userID, nil
}

// ConsumePasswordResetToken marks the token as used.
func (r *UserRepository) ConsumePasswordResetToken(ctx context.Context, token string) error {
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used = TRUE WHERE token = $1`, token)
	return err
}
