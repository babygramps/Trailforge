//go:build integration

package repository

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// newTestDB spins up a PostGIS container, runs the initial migration, and
// returns a *DB connected to it.  The container is torn down automatically
// when the test (or sub-test) finishes via tb.Cleanup.
func newTestDB(tb testing.TB) *DB {
	tb.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pgContainer, err := postgres.Run(ctx,
		"postgis/postgis:16-3.4-alpine",
		postgres.WithDatabase("trailforge_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		tb.Fatalf("starting postgres container: %v", err)
	}

	tb.Cleanup(func() {
		if err := pgContainer.Terminate(context.Background()); err != nil {
			tb.Logf("terminating postgres container: %v", err)
		}
	})

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		tb.Fatalf("getting connection string: %v", err)
	}

	db, err := NewDB(ctx, connStr)
	if err != nil {
		tb.Fatalf("connecting to test database: %v", err)
	}
	tb.Cleanup(func() { db.Close() })

	// Run migration.
	migrationPath := filepath.Join("..", "..", "migrations", "001_initial.up.sql")
	sql, err := os.ReadFile(migrationPath)
	if err != nil {
		tb.Fatalf("reading migration file: %v", err)
	}
	if _, err := db.Pool.Exec(ctx, string(sql)); err != nil {
		tb.Fatalf("executing migration: %v", err)
	}

	return db
}

// createTestUser inserts a test user into the database and returns its UUID.
func createTestUser(ctx context.Context, tb testing.TB, db *DB) string {
	tb.Helper()

	var id string
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ('user_' || uuid_generate_v4() || '@test.io', 'hashed_pw', 'Test User')
		 RETURNING id`,
	).Scan(&id)
	if err != nil {
		tb.Fatalf("creating test user: %v", err)
	}
	return id
}
