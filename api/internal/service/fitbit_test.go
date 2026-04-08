package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_FitbitService_Unconfigured(t *testing.T) {
	svc := NewFitbitService("", "", "")
	assert.False(t, svc.IsConfigured(), "service with empty credentials should not be configured")
}

func TestUnit_FitbitService_GracefulNoOp(t *testing.T) {
	svc := NewFitbitService("", "", "")
	ctx := context.Background()

	// GetHeartRate should return empty data without error.
	hr, err := svc.GetHeartRate(ctx, "", "2025-07-15")
	require.NoError(t, err, "unconfigured GetHeartRate should not error")
	assert.NotNil(t, hr)
	assert.Empty(t, hr.Zones, "zones should be empty for unconfigured service")

	// GetActivityLog should return empty slice without error.
	logs, err := svc.GetActivityLog(ctx, "", "2025-07-15")
	require.NoError(t, err, "unconfigured GetActivityLog should not error")
	assert.Empty(t, logs, "activity log should be empty for unconfigured service")
}

func TestUnit_FitbitService_AuthURL(t *testing.T) {
	clientID := "my-fitbit-client-id"
	svc := NewFitbitService(clientID, "my-secret", "http://localhost/callback")

	assert.True(t, svc.IsConfigured())

	url, err := svc.AuthURL("test-state")
	require.NoError(t, err)
	assert.Contains(t, url, clientID, "auth URL should contain the client_id")
	assert.Contains(t, url, "test-state", "auth URL should contain the state parameter")
	assert.Contains(t, url, "https://www.fitbit.com/oauth2/authorize", "should be Fitbit OAuth URL")
}
