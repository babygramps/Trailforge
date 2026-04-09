-- TrailForge schema — works on any PostgreSQL 13+ (no PostGIS required).
-- Geometry is stored as GeoJSON inside JSONB columns; spatial queries
-- happen client-side in MapLibre.  gen_random_uuid() is built-in since PG 13.

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============================================================================
-- Tracks – recorded GPS activities with GeoJSON geometry stored as JSONB
-- ============================================================================
CREATE TABLE IF NOT EXISTS tracks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'hike',
    description   TEXT NOT NULL DEFAULT '',
    geometry      JSONB,
    stats         JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks (user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_activity ON tracks (activity_type);
CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks (created_at DESC);

-- ============================================================================
-- Waypoints – named points of interest with plain lat/lon columns
-- ============================================================================
CREATE TABLE IF NOT EXISTS waypoints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lat         DOUBLE PRECISION NOT NULL DEFAULT 0,
    lon         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ele         DOUBLE PRECISION NOT NULL DEFAULT 0,
    icon        TEXT NOT NULL DEFAULT 'marker',
    color       TEXT NOT NULL DEFAULT '#FF5722',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints (user_id);

-- ============================================================================
-- Routes – planned routes with ordered waypoints, geometry as JSONB
-- ============================================================================
CREATE TABLE IF NOT EXISTS routes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    activity_type      TEXT NOT NULL DEFAULT 'hike',
    description        TEXT NOT NULL DEFAULT '',
    geometry           JSONB,
    waypoints          JSONB NOT NULL DEFAULT '[]',
    total_distance     DOUBLE PRECISION NOT NULL DEFAULT 0,
    estimated_duration DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes (user_id);

-- ============================================================================
-- Fitbit OAuth tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS fitbit_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    token_type      TEXT NOT NULL DEFAULT 'Bearer',
    expires_at      TIMESTAMPTZ NOT NULL,
    scope           TEXT NOT NULL DEFAULT '',
    fitbit_user_id  TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fitbit_tokens_user_id ON fitbit_tokens (user_id);
