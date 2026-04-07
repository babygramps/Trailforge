-- Enable PostGIS extension for spatial data types and functions.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================================
-- Tracks – recorded GPS activities with PostGIS LineStringZ geometry
-- ============================================================================
CREATE TABLE tracks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'hike',
    description   TEXT NOT NULL DEFAULT '',
    geometry      GEOMETRY(LineStringZ, 4326),
    stats         JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracks_user_id ON tracks (user_id);
CREATE INDEX idx_tracks_activity ON tracks (activity_type);
CREATE INDEX idx_tracks_geometry ON tracks USING GIST (geometry);
CREATE INDEX idx_tracks_created ON tracks (created_at DESC);

-- ============================================================================
-- Waypoints – named points of interest with PostGIS geography
-- ============================================================================
CREATE TABLE waypoints (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    ele         DOUBLE PRECISION NOT NULL DEFAULT 0,
    icon        TEXT NOT NULL DEFAULT 'marker',
    color       TEXT NOT NULL DEFAULT '#FF5722',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waypoints_user_id ON waypoints (user_id);
CREATE INDEX idx_waypoints_location ON waypoints USING GIST (location);

-- ============================================================================
-- Routes – planned routes with ordered waypoints
-- ============================================================================
CREATE TABLE routes (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    activity_type      TEXT NOT NULL DEFAULT 'hike',
    description        TEXT NOT NULL DEFAULT '',
    geometry           GEOMETRY(LineString, 4326),
    waypoints          JSONB NOT NULL DEFAULT '[]',
    total_distance     DOUBLE PRECISION NOT NULL DEFAULT 0,
    estimated_duration DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routes_user_id ON routes (user_id);
CREATE INDEX idx_routes_geometry ON routes USING GIST (geometry);

-- ============================================================================
-- Fitbit OAuth tokens – encrypted token storage for heart-rate integration
-- ============================================================================
CREATE TABLE fitbit_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_fitbit_tokens_user_id ON fitbit_tokens (user_id);
