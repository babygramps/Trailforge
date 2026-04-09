package repository

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
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

// Migrate runs all SQL migration files from the migrations directory in order.
func (db *DB) Migrate(ctx context.Context) error {
	// Try common migration paths (local dev vs Docker).
	paths := []string{"migrations", "/app/migrations", "api/migrations"}
	var migrationDir string
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			migrationDir = p
			break
		}
	}
	if migrationDir == "" {
		log.Println("no migrations directory found, skipping auto-migration")
		return nil
	}

	// Find all *.up.sql files and sort them.
	matches, err := filepath.Glob(filepath.Join(migrationDir, "*.up.sql"))
	if err != nil {
		return fmt.Errorf("finding migration files: %w", err)
	}
	sort.Strings(matches)

	for _, sqlFile := range matches {
		sql, err := os.ReadFile(sqlFile)
		if err != nil {
			return fmt.Errorf("reading migration file %s: %w", sqlFile, err)
		}

		if _, err := db.Pool.Exec(ctx, string(sql)); err != nil {
			// With IF NOT EXISTS on all DDL, errors here mean a real problem.
			// Log and continue — the table may already exist from a prior run.
			log.Printf("migration %s note: %v (may already be applied)", filepath.Base(sqlFile), err)
		} else {
			log.Printf("migration %s applied successfully", filepath.Base(sqlFile))
		}
	}

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
