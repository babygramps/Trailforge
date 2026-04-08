package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/testdata"
	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// mock TrackRepo
// ---------------------------------------------------------------------------

type mockTrackRepo struct {
	tracks map[string]*model.Track
	mu     sync.Mutex
}

func newMockTrackRepo() *mockTrackRepo {
	return &mockTrackRepo{tracks: make(map[string]*model.Track)}
}

func (r *mockTrackRepo) Create(_ context.Context, t *model.Track) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t.ID = uuid.NewString()
	t.CreatedAt = time.Now()
	t.UpdatedAt = t.CreatedAt
	r.tracks[t.ID] = t
	return nil
}

func (r *mockTrackRepo) GetByID(_ context.Context, id string) (*model.Track, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.tracks[id]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return t, nil
}

func (r *mockTrackRepo) List(_ context.Context, userID string, p model.Pagination) ([]model.Track, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p.Limit <= 0 {
		p.Limit = 50
	}
	var out []model.Track
	for _, t := range r.tracks {
		if t.UserID == userID {
			out = append(out, *t)
		}
	}
	// pagination
	if p.Offset >= len(out) {
		return []model.Track{}, nil
	}
	end := p.Offset + p.Limit
	if end > len(out) {
		end = len(out)
	}
	return out[p.Offset:end], nil
}

func (r *mockTrackRepo) ListInBounds(_ context.Context, userID string, _ model.BBox, p model.Pagination) ([]model.Track, error) {
	return r.List(context.Background(), userID, p)
}

func (r *mockTrackRepo) Update(_ context.Context, t *model.Track) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.tracks[t.ID]; !ok {
		return fmt.Errorf("not found")
	}
	t.UpdatedAt = time.Now()
	r.tracks[t.ID] = t
	return nil
}

func (r *mockTrackRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.tracks[id]; !ok {
		return fmt.Errorf("not found")
	}
	delete(r.tracks, id)
	return nil
}

func (r *mockTrackRepo) AppendPoints(_ context.Context, trackID string, points []model.Point) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.tracks[trackID]
	if !ok {
		return fmt.Errorf("not found")
	}
	// Parse existing geometry, append coordinates.
	var geom struct {
		Type        string      `json:"type"`
		Coordinates [][]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(t.Geometry, &geom); err != nil {
		// If geometry is wrapped in a Feature, try that.
		var feat struct {
			Geometry struct {
				Type        string      `json:"type"`
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
		}
		if err2 := json.Unmarshal(t.Geometry, &feat); err2 != nil {
			return fmt.Errorf("bad geometry")
		}
		geom.Type = feat.Geometry.Type
		geom.Coordinates = feat.Geometry.Coordinates
	}
	for _, p := range points {
		geom.Coordinates = append(geom.Coordinates, []float64{p.Lon, p.Lat, p.Ele})
	}
	raw, _ := json.Marshal(geom)
	t.Geometry = raw
	return nil
}

func (r *mockTrackRepo) GetLength(_ context.Context, _ string) (float64, error) {
	return 0, nil
}

func (r *mockTrackRepo) GetBounds(_ context.Context, _ string) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}

// ---------------------------------------------------------------------------
// mock UserRepo
// ---------------------------------------------------------------------------

type mockUserRepo struct {
	users   map[string]*model.User
	byEmail map[string]*model.User
	mu      sync.Mutex
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{
		users:   make(map[string]*model.User),
		byEmail: make(map[string]*model.User),
	}
}

func (r *mockUserRepo) Create(_ context.Context, u *model.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.byEmail[u.Email]; exists {
		return fmt.Errorf("duplicate email")
	}
	u.ID = uuid.NewString()
	u.CreatedAt = time.Now()
	u.UpdatedAt = u.CreatedAt
	r.users[u.ID] = u
	r.byEmail[u.Email] = u
	return nil
}

func (r *mockUserRepo) GetByID(_ context.Context, id string) (*model.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[id]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return u, nil
}

func (r *mockUserRepo) GetByEmail(_ context.Context, email string) (*model.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.byEmail[email]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return u, nil
}

func (r *mockUserRepo) List(_ context.Context, limit, offset int) ([]model.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []model.User
	for _, u := range r.users {
		out = append(out, *u)
	}
	if offset >= len(out) {
		return []model.User{}, nil
	}
	end := offset + limit
	if end > len(out) {
		end = len(out)
	}
	return out[offset:end], nil
}

func (r *mockUserRepo) Update(_ context.Context, u *model.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.users[u.ID]; !ok {
		return fmt.Errorf("not found")
	}
	u.UpdatedAt = time.Now()
	r.users[u.ID] = u
	r.byEmail[u.Email] = u
	return nil
}

func (r *mockUserRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[id]
	if !ok {
		return fmt.Errorf("not found")
	}
	delete(r.users, id)
	delete(r.byEmail, u.Email)
	return nil
}

// ---------------------------------------------------------------------------
// mock WaypointRepo
// ---------------------------------------------------------------------------

type mockWaypointRepo struct {
	waypoints map[string]*model.Waypoint
	mu        sync.Mutex
}

func newMockWaypointRepo() *mockWaypointRepo {
	return &mockWaypointRepo{waypoints: make(map[string]*model.Waypoint)}
}

func (r *mockWaypointRepo) Create(_ context.Context, w *model.Waypoint) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	w.ID = uuid.NewString()
	w.CreatedAt = time.Now()
	w.UpdatedAt = w.CreatedAt
	r.waypoints[w.ID] = w
	return nil
}

func (r *mockWaypointRepo) GetByID(_ context.Context, id string) (*model.Waypoint, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	w, ok := r.waypoints[id]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return w, nil
}

func (r *mockWaypointRepo) List(_ context.Context, userID string, p model.Pagination) ([]model.Waypoint, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []model.Waypoint
	for _, w := range r.waypoints {
		if w.UserID == userID {
			out = append(out, *w)
		}
	}
	if p.Offset >= len(out) {
		return []model.Waypoint{}, nil
	}
	end := p.Offset + p.Limit
	if end > len(out) {
		end = len(out)
	}
	return out[p.Offset:end], nil
}

func (r *mockWaypointRepo) ListNear(_ context.Context, userID string, _, _, _ float64, p model.Pagination) ([]model.Waypoint, error) {
	return r.List(context.Background(), userID, p)
}

func (r *mockWaypointRepo) Update(_ context.Context, w *model.Waypoint) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.waypoints[w.ID]; !ok {
		return fmt.Errorf("not found")
	}
	w.UpdatedAt = time.Now()
	r.waypoints[w.ID] = w
	return nil
}

func (r *mockWaypointRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.waypoints[id]; !ok {
		return fmt.Errorf("not found")
	}
	delete(r.waypoints, id)
	return nil
}

// ---------------------------------------------------------------------------
// helper: Echo instance wired for testing
// ---------------------------------------------------------------------------

const testJWTSecret = testdata.TestJWTSecret

// newTestEcho creates a configured Echo instance with JWT middleware and all
// required handler groups registered. It uses the provided mock repos.
func newTestEcho(userRepo *mockUserRepo, trackRepo *mockTrackRepo, wpRepo *mockWaypointRepo) *echo.Echo {
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.JWTAuth(testJWTSecret))

	api := e.Group("/api")

	authH := NewAuthHandler(userRepo, testJWTSecret)
	authH.Register(api.Group("/auth"))

	if trackRepo != nil {
		trackH := NewTrackHandler(trackRepo)
		trackH.Register(api.Group("/tracks"))
	}

	if wpRepo != nil {
		wpH := NewWaypointHandler(wpRepo)
		wpH.Register(api.Group("/waypoints"))
	}

	return e
}

// ---------------------------------------------------------------------------
// helper: generate a JWT for tests
// ---------------------------------------------------------------------------

func generateTestJWT(userID, secret string) string {
	claims := &middleware.Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "trailforge",
		},
	}
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	return token
}

func generateExpiredJWT(userID, secret string) string {
	claims := &middleware.Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Issuer:    "trailforge",
		},
	}
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	return token
}

// ---------------------------------------------------------------------------
// helper: build an authenticated HTTP request
// ---------------------------------------------------------------------------

func newAuthenticatedRequest(method, path, body, userID string) (*http.Request, *httptest.ResponseRecorder) {
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	if userID != "" {
		token := generateTestJWT(userID, testJWTSecret)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	return req, rec
}

// parseJSON is a convenience to decode the response body into a map.
func parseJSON(rec *httptest.ResponseRecorder) map[string]any {
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return m
}

// fmtFloat formats a float64 for JSON embedding.
func fmtFloat(f float64) string {
	return fmt.Sprintf("%g", f)
}
