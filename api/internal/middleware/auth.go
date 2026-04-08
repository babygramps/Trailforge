package middleware

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

// ContextKeyUserID is the key used to store the authenticated user ID in the context.
const ContextKeyUserID = "user_id"

// Claims extends the standard JWT claims with a user ID.
type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// JWTAuth returns Echo middleware that validates Bearer tokens and populates
// the user ID in the request context. Paths in the skip list bypass authentication.
func JWTAuth(secret string) echo.MiddlewareFunc {
	skipPaths := map[string]bool{
		"/api/health":        true,
		"/api/auth/register": true,
		"/api/auth/login":    true,
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			path := c.Request().URL.Path

			// Only require auth for /api and /ws paths.
			if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/ws/") {
				return next(c)
			}

			// Skip auth for allowlisted API paths.
			if skipPaths[path] {
				return next(c)
			}

			// Also skip for any path prefix that should be public.
			if strings.HasPrefix(path, "/api/health") {
				return next(c)
			}

			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization format")
			}

			tokenStr := parts[1]
			claims := &Claims{}

			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, echo.NewHTTPError(http.StatusUnauthorized, "unexpected signing method")
				}
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
			}

			c.Set(ContextKeyUserID, claims.UserID)
			return next(c)
		}
	}
}

// GetUserID extracts the authenticated user ID from the echo context.
func GetUserID(c echo.Context) string {
	if id, ok := c.Get(ContextKeyUserID).(string); ok {
		return id
	}
	return ""
}
