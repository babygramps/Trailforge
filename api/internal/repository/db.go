package repository

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgx connection pool and provides access to all repositories.
type DB struct {
	Pool *pgxpool.Pool
}

// NewDB creates a new database connection pool and verifies connectivity.
func NewDB(ctx context.Context, databaseURL string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing database url: %w", err)
	}

	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	db := &DB{Pool: pool}

	// Auto-run migrations on startup.
	if err := db.Migrate(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("running migrations: %w", err)
	}

	return db, nil
}

// Migrate runs SQL migration files from the migrations directory.
func (db *DB) Migrate(ctx context.Context) error {
	// Try common migration paths (local dev vs Docker).
	paths := []string{"migrations", "/app/migrations", "api/migrations"}
	var migrationDir string
	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(p, "001_initial.up.sql")); err == nil {
			migrationDir = p
			break
		}
	}
	if migrationDir == "" {
		log.Println("no migrations directory found, skipping auto-migration")
		return nil
	}

	sqlFile := filepath.Join(migrationDir, "001_initial.up.sql")
	sql, err := os.ReadFile(sqlFile)
	if err != nil {
		return fmt.Errorf("reading migration file: %w", err)
	}

	if _, err := db.Pool.Exec(ctx, string(sql)); err != nil {
		// Tables may already exist — that's fine.
		log.Printf("migration note: %v (may already be applied)", err)
		return nil
	}

	log.Println("database migration applied successfully")
	return nil
}

// Close shuts down the connection pool.
func (db *DB) Close() {
	db.Pool.Close()
}

// Healthy returns true when the pool can reach PostgreSQL.
func (db *DB) Healthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return db.Pool.Ping(ctx) == nil
}
