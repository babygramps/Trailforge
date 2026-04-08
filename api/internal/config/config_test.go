package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_Config_Validate_MissingDatabaseURL(t *testing.T) {
	cfg := &Config{
		DatabaseURL: "",
		JWTSecret:   "some-secret",
	}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DATABASE_URL")
}

func TestUnit_Config_Validate_MissingJWTSecret(t *testing.T) {
	cfg := &Config{
		DatabaseURL: "postgres://localhost/trailforge",
		JWTSecret:   "",
	}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET")
}

func TestUnit_Config_Validate_ValidConfig(t *testing.T) {
	cfg := &Config{
		DatabaseURL: "postgres://localhost/trailforge",
		JWTSecret:   "super-secret",
	}
	err := cfg.Validate()
	assert.NoError(t, err)
}

func TestUnit_Config_Load_Defaults(t *testing.T) {
	// Save and restore existing env vars.
	origDB := os.Getenv("DATABASE_URL")
	origJWT := os.Getenv("JWT_SECRET")
	origPort := os.Getenv("API_PORT")
	t.Cleanup(func() {
		os.Setenv("DATABASE_URL", origDB)
		os.Setenv("JWT_SECRET", origJWT)
		os.Setenv("API_PORT", origPort)
	})

	os.Setenv("DATABASE_URL", "postgres://test/db")
	os.Setenv("JWT_SECRET", "test-secret")
	os.Unsetenv("API_PORT") // ensure default is used

	cfg := Load()

	assert.Equal(t, "postgres://test/db", cfg.DatabaseURL)
	assert.Equal(t, "test-secret", cfg.JWTSecret)
	assert.Equal(t, "8080", cfg.APIPort, "APIPort should default to 8080")
}
