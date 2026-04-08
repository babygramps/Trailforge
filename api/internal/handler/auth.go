package handler

import (
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/internal/repository"
)

const (
	accessTokenDuration  = 15 * time.Minute
	refreshTokenDuration = 7 * 24 * time.Hour
)

// AuthHandler handles user registration, login, and token refresh.
type AuthHandler struct {
	users     repository.UserRepo
	jwtSecret []byte
}

// NewAuthHandler returns a new AuthHandler.
func NewAuthHandler(users repository.UserRepo, jwtSecret string) *AuthHandler {
	return &AuthHandler{
		users:     users,
		jwtSecret: []byte(jwtSecret),
	}
}

// Register attaches auth routes to the given echo group.
func (h *AuthHandler) Register(g *echo.Group) {
	g.POST("/register", h.RegisterUser)
	g.POST("/login", h.Login)
	g.POST("/refresh", h.Refresh)
}

// RegisterUser creates a new user account and returns JWT tokens.
func (h *AuthHandler) RegisterUser(c echo.Context) error {
	var req model.UserRegistration
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email, password, and display_name are required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to hash password")
	}

	user := &model.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		DisplayName:  req.DisplayName,
	}

	if err := h.users.Create(c.Request().Context(), user); err != nil {
		return echo.NewHTTPError(http.StatusConflict, "email already registered")
	}

	tokens, err := h.generateTokens(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate tokens")
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
}

// Login authenticates a user by email/password and returns JWT tokens.
func (h *AuthHandler) Login(c echo.Context) error {
	var req model.UserLogin
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password are required")
	}

	user, err := h.users.GetByEmail(c.Request().Context(), req.Email)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	tokens, err := h.generateTokens(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate tokens")
	}

	return c.JSON(http.StatusOK, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
}

// Refresh issues a new access token from a valid refresh token.
func (h *AuthHandler) Refresh(c echo.Context) error {
	var req model.RefreshRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.RefreshToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "refresh_token is required")
	}

	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(req.RefreshToken, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, echo.NewHTTPError(http.StatusUnauthorized, "unexpected signing method")
		}
		return h.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired refresh token")
	}

	// Verify the user still exists.
	if _, err := h.users.GetByID(c.Request().Context(), claims.UserID); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
	}

	tokens, err := h.generateTokens(claims.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate tokens")
	}

	return c.JSON(http.StatusOK, tokens)
}

// generateTokens creates a short-lived access token and a long-lived refresh token.
func (h *AuthHandler) generateTokens(userID string) (*model.AuthTokens, error) {
	now := time.Now()

	accessClaims := &middleware.Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "trailforge",
		},
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(h.jwtSecret)
	if err != nil {
		return nil, err
	}

	refreshClaims := &middleware.Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(refreshTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "trailforge",
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString(h.jwtSecret)
	if err != nil {
		return nil, err
	}

	return &model.AuthTokens{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}
