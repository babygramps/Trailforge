package service

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// FitbitService provides integration with the Fitbit Web API for heart-rate
// and activity data. When credentials are not configured it degrades to a
// graceful no-op so the rest of the system continues to function.
type FitbitService struct {
	clientID     string
	clientSecret string
	redirectURI  string
	httpClient   *http.Client
	configured   bool
}

// FitbitTokens holds the OAuth2 token pair for a user.
type FitbitTokens struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// HeartRateData holds intraday heart-rate samples.
type HeartRateData struct {
	Date   string          `json:"date"`
	Zones  []HeartRateZone `json:"zones"`
}

// HeartRateZone describes a single HR zone summary.
type HeartRateZone struct {
	Name    string  `json:"name"`
	Min     int     `json:"min"`
	Max     int     `json:"max"`
	Minutes float64 `json:"minutes"`
}

// ActivityLogEntry is a single Fitbit activity record.
type ActivityLogEntry struct {
	LogID        string    `json:"log_id"`
	ActivityName string    `json:"activity_name"`
	StartTime    time.Time `json:"start_time"`
	Duration     float64   `json:"duration_ms"`
	Calories     int       `json:"calories"`
	Distance     float64   `json:"distance_km"`
}

// NewFitbitService creates a FitbitService. If clientID or clientSecret are
// empty the service marks itself as unconfigured and all methods return
// no-op results instead of errors.
func NewFitbitService(clientID, clientSecret, redirectURI string) *FitbitService {
	configured := clientID != "" && clientSecret != ""
	return &FitbitService{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
		configured:   configured,
	}
}

// IsConfigured reports whether the Fitbit integration has valid credentials.
func (s *FitbitService) IsConfigured() bool {
	return s.configured
}

// ExchangeCode trades an OAuth2 authorization code for an access/refresh token
// pair. Returns an error when the service is not configured.
func (s *FitbitService) ExchangeCode(ctx context.Context, code string) (*FitbitTokens, error) {
	if !s.configured {
		return nil, fmt.Errorf("fitbit integration is not configured")
	}

	// In a full implementation this would POST to
	// https://api.fitbit.com/oauth2/token with grant_type=authorization_code.
	// For now we return a structured error so callers can integrate.
	_ = ctx
	_ = code
	return nil, fmt.Errorf("ExchangeCode: not yet implemented against Fitbit API")
}

// RefreshToken uses a refresh token to obtain a new access token.
func (s *FitbitService) RefreshToken(ctx context.Context, refreshToken string) (*FitbitTokens, error) {
	if !s.configured {
		return nil, fmt.Errorf("fitbit integration is not configured")
	}

	_ = ctx
	_ = refreshToken
	return nil, fmt.Errorf("RefreshToken: not yet implemented against Fitbit API")
}

// GetHeartRate retrieves intraday heart-rate data for a given date.
// When unconfigured it returns an empty result.
func (s *FitbitService) GetHeartRate(ctx context.Context, accessToken string, date string) (*HeartRateData, error) {
	if !s.configured {
		return &HeartRateData{Date: date}, nil
	}

	_ = ctx
	_ = accessToken
	return nil, fmt.Errorf("GetHeartRate: not yet implemented against Fitbit API")
}

// GetActivityLog retrieves recent activity log entries.
// When unconfigured it returns an empty slice.
func (s *FitbitService) GetActivityLog(ctx context.Context, accessToken string, afterDate string) ([]ActivityLogEntry, error) {
	if !s.configured {
		return []ActivityLogEntry{}, nil
	}

	_ = ctx
	_ = accessToken
	return nil, fmt.Errorf("GetActivityLog: not yet implemented against Fitbit API")
}

// AuthURL returns the Fitbit OAuth2 authorization URL for user consent.
func (s *FitbitService) AuthURL(state string) (string, error) {
	if !s.configured {
		return "", fmt.Errorf("fitbit integration is not configured")
	}

	url := fmt.Sprintf(
		"https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=heartrate+activity&state=%s",
		s.clientID, s.redirectURI, state,
	)
	return url, nil
}
