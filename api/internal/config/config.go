package config

import (
	"fmt"
	"os"
)

// Config holds all configuration values sourced from environment variables.
type Config struct {
	DatabaseURL       string
	JWTSecret         string
	APIPort           string
	FitbitClientID    string
	FitbitClientSecret string
	ValhallaURL       string
	TileServerURL     string
	SatelliteProvider string
	SatelliteAPIKey   string
}

// Load reads configuration from environment variables, applying sensible defaults
// where appropriate.
func Load() *Config {
	return &Config{
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		JWTSecret:          getEnv("JWT_SECRET", ""),
		APIPort:            getEnv("API_PORT", "8080"),
		FitbitClientID:     getEnv("FITBIT_CLIENT_ID", ""),
		FitbitClientSecret: getEnv("FITBIT_CLIENT_SECRET", ""),
		ValhallaURL:        getEnv("VALHALLA_URL", "http://valhalla:8002"),
		TileServerURL:      getEnv("TILE_SERVER_URL", "http://tileserver:8081"),
		SatelliteProvider:  getEnv("SATELLITE_PROVIDER", ""),
		SatelliteAPIKey:    getEnv("SATELLITE_API_KEY", ""),
	}
}

// Validate checks that all required configuration values are present.
func (c *Config) Validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if c.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
