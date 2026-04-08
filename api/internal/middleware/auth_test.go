package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-jwt-secret-for-unit-tests"

// createTestToken generates a signed JWT for testing.
func createTestToken(userID string, secret string, expiresAt time.Time) (string, error) {
	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func TestUnit_JWTAuth_ValidToken(t *testing.T) {
	e := echo.New()

	userID := "user-abc-123"
	tokenStr, err := createTestToken(userID, testSecret, time.Now().Add(1*time.Hour))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/tracks", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/tracks")

	// The handler that runs after middleware passes.
	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	mw := JWTAuth(testSecret)
	err = mw(handler)(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, userID, GetUserID(c))
}

func TestUnit_JWTAuth_ExpiredToken(t *testing.T) {
	e := echo.New()

	tokenStr, err := createTestToken("user-expired", testSecret, time.Now().Add(-1*time.Hour))
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/tracks", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/tracks")

	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	mw := JWTAuth(testSecret)
	err = mw(handler)(c)

	// The middleware should return an HTTP error for expired tokens.
	require.Error(t, err)
	httpErr, ok := err.(*echo.HTTPError)
	require.True(t, ok, "error should be an echo.HTTPError")
	assert.Equal(t, http.StatusUnauthorized, httpErr.Code)
}

func TestUnit_JWTAuth_SkipPaths(t *testing.T) {
	e := echo.New()

	// No Authorization header at all.
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/health")

	called := false
	handler := func(c echo.Context) error {
		called = true
		return c.String(http.StatusOK, "healthy")
	}

	mw := JWTAuth(testSecret)
	err := mw(handler)(c)
	require.NoError(t, err)
	assert.True(t, called, "handler should have been called for skip path")
	assert.Equal(t, http.StatusOK, rec.Code)
}
