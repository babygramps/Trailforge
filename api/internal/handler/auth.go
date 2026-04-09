package handler

import (
	"crypto/rand"
	"encoding/hex"
	"log"
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
	g.GET("/me", h.Me)
	g.POST("/forgot-password", h.ForgotPassword)
	g.POST("/reset-password", h.ResetPassword)
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

// Me returns the currently authenticated user.
func (h *AuthHandler) Me(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}

	user, err := h.users.GetByID(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}

	return c.JSON(http.StatusOK, user)
}

// ForgotPassword generates a password reset token. Since no email service is
// configured, the reset link is logged to the server console.
func (h *AuthHandler) ForgotPassword(c echo.Context) error {
	var req model.ForgotPasswordRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email is required")
	}

	user, err := h.users.GetByEmail(c.Request().Context(), req.Email)
	if err != nil {
		// Don't reveal whether the email exists — always return success
		return c.JSON(http.StatusOK, map[string]string{
			"message": "If that email is registered, a reset link has been generated. Check server logs.",
		})
	}

	// Generate a secure random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(1 * time.Hour)

	if err := h.users.CreatePasswordResetToken(c.Request().Context(), user.ID, token, expiresAt); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create reset token")
	}

	// Log the reset link (no email service configured)
	scheme := "https"
	if c.Request().TLS == nil && c.Request().Header.Get("X-Forwarded-Proto") == "" {
		scheme = "http"
	}
	resetURL := scheme + "://" + c.Request().Host + "/reset-password?token=" + token
	log.Printf("[AUTH] Password reset requested for %s\n  Reset URL: %s\n  Expires: %s",
		user.Email, resetURL, expiresAt.Format(time.RFC3339))

	return c.JSON(http.StatusOK, map[string]string{
		"message": "If that email is registered, a reset link has been generated. Check server logs.",
	})
}

// ResetPassword validates the token and sets a new password.
func (h *AuthHandler) ResetPassword(c echo.Context) error {
	var req model.ResetPasswordRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Token == "" || req.NewPassword == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token and new_password are required")
	}
	if len(req.NewPassword) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	userID, err := h.users.ValidatePasswordResetToken(c.Request().Context(), req.Token)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid or expired reset token")
	}

	user, err := h.users.GetByID(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "user not found")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to hash password")
	}
	user.PasswordHash = string(hash)

	if err := h.users.Update(c.Request().Context(), user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update password")
	}

	// Mark the token as used
	_ = h.users.ConsumePasswordResetToken(c.Request().Context(), req.Token)

	// Return tokens so the user is logged in after reset
	tokens, err := h.generateTokens(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate tokens")
	}

	log.Printf("[AUTH] Password reset completed for %s", user.Email)

	return c.JSON(http.StatusOK, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
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
