package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/testdata"
)

// registerTestUser is a helper that registers a user and returns the response map.
func registerTestUser(e *echo.Echo) map[string]any {
	body := `{"email":"` + testdata.TestUserEmail + `","password":"` + testdata.TestUserPassword + `","display_name":"` + testdata.TestUserDisplayName + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return parseJSON(rec)
}

func TestAPI_Auth_Register_Success(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)

	body := `{"email":"` + testdata.TestUserEmail + `","password":"` + testdata.TestUserPassword + `","display_name":"` + testdata.TestUserDisplayName + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	user, ok := m["user"].(map[string]any)
	if !ok || user["id"] == nil {
		t.Fatal("response missing user.id")
	}
	tokens, ok := m["tokens"].(map[string]any)
	if !ok || tokens["access_token"] == nil || tokens["refresh_token"] == nil {
		t.Fatal("response missing tokens")
	}
}

func TestAPI_Auth_Register_MissingFields(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Register_ShortPassword(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)

	body := `{"email":"short@test.io","password":"abc","display_name":"Short"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Register_DuplicateEmail(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)

	body := `{"email":"` + testdata.TestUserEmail + `","password":"` + testdata.TestUserPassword + `","display_name":"` + testdata.TestUserDisplayName + `"}`

	// First registration.
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("first register: expected 201, got %d", rec.Code)
	}

	// Second registration with same email.
	req = httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Login_Success(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)
	registerTestUser(e)

	loginBody := `{"email":"` + testdata.TestUserEmail + `","password":"` + testdata.TestUserPassword + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	tokens, ok := m["tokens"].(map[string]any)
	if !ok || tokens["access_token"] == nil {
		t.Fatal("response missing tokens")
	}
}

func TestAPI_Auth_Login_WrongPassword(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)
	registerTestUser(e)

	loginBody := `{"email":"` + testdata.TestUserEmail + `","password":"wrong-password-xyz"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Login_NonexistentEmail(t *testing.T) {
	e := newTestEcho(newMockUserRepo(), nil, nil)

	loginBody := `{"email":"nobody@test.io","password":"whatever1234"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Refresh_Success(t *testing.T) {
	userRepo := newMockUserRepo()
	e := newTestEcho(userRepo, nil, nil)

	// Register to get tokens.
	regBody := `{"email":"` + testdata.TestUserEmail + `","password":"` + testdata.TestUserPassword + `","display_name":"` + testdata.TestUserDisplayName + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(regBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register failed: %d %s", rec.Code, rec.Body.String())
	}

	regResp := parseJSON(rec)
	tokens := regResp["tokens"].(map[string]any)
	refreshToken := tokens["refresh_token"].(string)
	accessToken := tokens["access_token"].(string)

	// Use refresh endpoint -- requires auth header since the middleware doesn't skip it.
	refreshBody := `{"refresh_token":"` + refreshToken + `"}`
	req = httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	m := parseJSON(rec)
	if m["access_token"] == nil || m["refresh_token"] == nil {
		t.Fatal("response missing new tokens")
	}
}

func TestAPI_Auth_Refresh_ExpiredToken(t *testing.T) {
	userRepo := newMockUserRepo()
	e := newTestEcho(userRepo, nil, nil)

	// Register to get a user in the repo.
	regResp := registerTestUser(e)
	user := regResp["user"].(map[string]any)
	userID := user["id"].(string)

	// Create an expired JWT to use as refresh token.
	expiredToken := generateExpiredJWT(userID, testJWTSecret)

	// We still need a valid access token for the middleware.
	validAccess := generateTestJWT(userID, testJWTSecret)

	refreshBody := `{"refresh_token":"` + expiredToken + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+validAccess)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAPI_Auth_Refresh_InvalidToken(t *testing.T) {
	userRepo := newMockUserRepo()
	e := newTestEcho(userRepo, nil, nil)

	// Register to get a user in the repo.
	regResp := registerTestUser(e)
	user := regResp["user"].(map[string]any)
	userID := user["id"].(string)

	validAccess := generateTestJWT(userID, testJWTSecret)

	refreshBody := `{"refresh_token":"this-is-not-a-valid-jwt"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+validAccess)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}
