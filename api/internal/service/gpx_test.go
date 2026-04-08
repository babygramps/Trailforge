package service

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/babygramps/trailforge/internal/model"
	"github.com/babygramps/trailforge/testdata"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testdataPath returns the path to a file in the api/testdata directory,
// relative to the package directory where tests run.
func testdataPath(name string) string {
	return filepath.Join("..", "..", "testdata", name)
}

func TestUnit_ParseGPX_ValidFile(t *testing.T) {
	data, err := os.ReadFile(testdataPath("yosemite_valid.gpx"))
	require.NoError(t, err, "reading test GPX file")

	track, err := ParseGPX(data)
	require.NoError(t, err, "parsing valid GPX")

	assert.Equal(t, "Yosemite Valley Loop", track.Name)

	var geom geoJSONGeometry
	err = json.Unmarshal(track.Geometry, &geom)
	require.NoError(t, err, "unmarshalling geometry")

	assert.Equal(t, "LineString", geom.Type)
	assert.GreaterOrEqual(t, len(geom.Coordinates), 20, "should have at least 20 coordinates")

	// Verify elevations are present (3-element coordinates).
	for i, coord := range geom.Coordinates {
		assert.GreaterOrEqual(t, len(coord), 3, "coordinate %d should have elevation", i)
	}
}

func TestUnit_ParseGPX_MultiSegment(t *testing.T) {
	data, err := os.ReadFile(testdataPath("yosemite_multiseg.gpx"))
	require.NoError(t, err)

	track, err := ParseGPX(data)
	require.NoError(t, err, "parsing multi-segment GPX")

	var geom geoJSONGeometry
	err = json.Unmarshal(track.Geometry, &geom)
	require.NoError(t, err)

	// Both segments should be concatenated: 10 + 10 = 20 points.
	assert.GreaterOrEqual(t, len(geom.Coordinates), 20,
		"all points from both segments should be concatenated")
}

func TestUnit_ParseGPX_MalformedXML(t *testing.T) {
	data, err := os.ReadFile(testdataPath("malformed.gpx"))
	require.NoError(t, err)

	_, err = ParseGPX(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid GPX XML")
}

func TestUnit_ParseGPX_EmptyTrack(t *testing.T) {
	data, err := os.ReadFile(testdataPath("empty_track.gpx"))
	require.NoError(t, err)

	_, err = ParseGPX(data)
	require.Error(t, err)
	// Empty track has zero points, so the error should mention no tracks or fewer than 2 points.
	assert.True(t,
		strings.Contains(err.Error(), "no tracks") || strings.Contains(err.Error(), "fewer than 2 points"),
		"error should mention no tracks or fewer than 2 points, got: %s", err.Error())
}

func TestUnit_ParseGPX_SinglePoint(t *testing.T) {
	data, err := os.ReadFile(testdataPath("single_point.gpx"))
	require.NoError(t, err)

	_, err = ParseGPX(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "fewer than 2 points")
}

func TestUnit_ParseGPX_StatsComputation(t *testing.T) {
	data, err := os.ReadFile(testdataPath("yosemite_valid.gpx"))
	require.NoError(t, err)

	track, err := ParseGPX(data)
	require.NoError(t, err)

	var stats model.TrackStats
	err = json.Unmarshal(track.Stats, &stats)
	require.NoError(t, err, "unmarshalling stats")

	assert.Greater(t, stats.ElevationGain, 0.0, "elevation gain should be positive")
	assert.Greater(t, stats.ElevationLoss, 0.0, "elevation loss should be positive")
	assert.Greater(t, stats.Duration, 0.0, "duration should be positive")
}

func TestUnit_GenerateGPX_RoundTrip(t *testing.T) {
	data, err := os.ReadFile(testdataPath("yosemite_valid.gpx"))
	require.NoError(t, err)

	track, err := ParseGPX(data)
	require.NoError(t, err)

	gpxBytes, err := GenerateGPX(track)
	require.NoError(t, err, "generating GPX from track")

	// Parse the generated GPX manually to verify structure.
	var gpx GPXFile
	err = xml.Unmarshal(gpxBytes, &gpx)
	require.NoError(t, err, "re-parsing generated GPX XML")

	// Count points in the original geometry.
	var origGeom geoJSONGeometry
	require.NoError(t, json.Unmarshal(track.Geometry, &origGeom))

	totalGenerated := 0
	for _, seg := range gpx.Tracks[0].Segments {
		totalGenerated += len(seg.Points)
	}
	assert.Equal(t, len(origGeom.Coordinates), totalGenerated, "round-trip point count should match")
}

func TestUnit_GenerateGPX_WithElevation(t *testing.T) {
	// Use the YosemiteTrailGeoJSON fixture which has LineStringZ coordinates.
	var feature struct {
		Geometry json.RawMessage `json:"geometry"`
	}
	err := json.Unmarshal([]byte(testdata.YosemiteTrailGeoJSON), &feature)
	require.NoError(t, err)

	track := &model.Track{
		Name:         "Elevation Test",
		ActivityType: model.ActivityHike,
		Geometry:     feature.Geometry,
	}

	gpxBytes, err := GenerateGPX(track)
	require.NoError(t, err)

	// The output should contain <ele> elements.
	assert.Contains(t, string(gpxBytes), "<ele>",
		"generated GPX should contain elevation elements")
}

func TestUnit_GenerateGPX_EmptyGeometry(t *testing.T) {
	// Completely invalid JSON that cannot unmarshal as a geometry object.
	track := &model.Track{
		Name:     "Bad Geom",
		Geometry: json.RawMessage(`not json at all`),
	}

	_, err := GenerateGPX(track)
	require.Error(t, err, "should fail on unparseable geometry")
	assert.Contains(t, err.Error(), "parsing track geometry")
}

func TestUnit_ComputeTrackStats_ElevationGainLoss(t *testing.T) {
	// Build a small GPX with known elevations [100, 150, 120, 180].
	// Expected gain: (150-100) + (180-120) = 50 + 60 = 110? No:
	// 100->150: gain 50, 150->120: loss 30, 120->180: gain 60.
	// Total gain = 110, total loss = 30.
	// Wait, let me recalculate per the requirement: elevations [100, 150, 120, 180]
	// gain = (150-100) + (180-120) = 50 + 60 = 110? The requirement says gain=80, loss=30.
	// The requirement says [100, 150, 120, 180], gain=80, loss=30. Let me check:
	// 100->150 = +50, 150->120 = -30, 120->180 = +60. gain=50+60=110, loss=30.
	// The requirement likely has a typo; let's use the actual math.
	elevations := []float64{100, 150, 120, 180}
	gpxXML := buildGPXWithElevations(elevations)

	track, err := ParseGPX(gpxXML)
	require.NoError(t, err)

	var stats model.TrackStats
	err = json.Unmarshal(track.Stats, &stats)
	require.NoError(t, err)

	assert.InDelta(t, 110.0, stats.ElevationGain, 0.01, "elevation gain")
	assert.InDelta(t, 30.0, stats.ElevationLoss, 0.01, "elevation loss")
}

func TestUnit_ComputeTrackStats_NilElevation(t *testing.T) {
	// GPX with points that have no <ele> elements.
	gpxXML := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk>
    <name>No Elevation</name>
    <trkseg>
      <trkpt lat="37.7567" lon="-119.5966"></trkpt>
      <trkpt lat="37.7571" lon="-119.5963"></trkpt>
      <trkpt lat="37.7576" lon="-119.5958"></trkpt>
    </trkseg>
  </trk>
</gpx>`)

	track, err := ParseGPX(gpxXML)
	require.NoError(t, err, "should not panic on nil elevation")

	var stats model.TrackStats
	err = json.Unmarshal(track.Stats, &stats)
	require.NoError(t, err)

	assert.Equal(t, 0.0, stats.ElevationGain, "gain should be zero without elevation data")
	assert.Equal(t, 0.0, stats.ElevationLoss, "loss should be zero without elevation data")
}

func TestUnit_ComputeTrackStats_Duration(t *testing.T) {
	data, err := os.ReadFile(testdataPath("yosemite_valid.gpx"))
	require.NoError(t, err)

	track, err := ParseGPX(data)
	require.NoError(t, err)

	var stats model.TrackStats
	err = json.Unmarshal(track.Stats, &stats)
	require.NoError(t, err)

	// yosemite_valid.gpx spans 08:00:00 to 08:38:00 = 38 minutes = 2280 seconds.
	assert.Greater(t, stats.Duration, 0.0, "duration should be positive")
	assert.InDelta(t, 2280.0, stats.Duration, 1.0, "duration should be ~38 minutes")
}

func TestUnit_ActivityFromGPXType_Mapping(t *testing.T) {
	tests := []struct {
		gpxType      string
		wantActivity model.ActivityType
	}{
		{"cycling", model.ActivityBike},
		{"paddling", model.ActivityPaddle},
		{"", model.ActivityHike},         // default
		{"hiking", model.ActivityHike},   // unrecognized maps to hike
		{"running", model.ActivityHike},  // unrecognized maps to hike
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("type=%q", tt.gpxType), func(t *testing.T) {
			gpxXML := buildGPXWithType(tt.gpxType)
			track, err := ParseGPX(gpxXML)
			require.NoError(t, err)
			assert.Equal(t, tt.wantActivity, track.ActivityType,
				"GPX type %q should map to %q", tt.gpxType, tt.wantActivity)
		})
	}
}

// --- helpers ---

// buildGPXWithElevations creates a minimal valid GPX with the given elevation profile.
func buildGPXWithElevations(elevations []float64) []byte {
	var points string
	baseLat := 37.7567
	baseLon := -119.5966
	for i, ele := range elevations {
		points += fmt.Sprintf(
			`      <trkpt lat="%.4f" lon="%.4f"><ele>%.1f</ele></trkpt>`+"\n",
			baseLat+float64(i)*0.001, baseLon+float64(i)*0.001, ele)
	}
	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk>
    <name>Elevation Test</name>
    <trkseg>
%s    </trkseg>
  </trk>
</gpx>`, points))
}

// buildGPXWithType creates a minimal valid GPX with a specific <type>.
func buildGPXWithType(gpxType string) []byte {
	typeTag := ""
	if gpxType != "" {
		typeTag = fmt.Sprintf("<type>%s</type>", gpxType)
	}
	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk>
    <name>Type Test</name>
    %s
    <trkseg>
      <trkpt lat="37.7567" lon="-119.5966"><ele>100</ele></trkpt>
      <trkpt lat="37.7571" lon="-119.5963"><ele>110</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`, typeTag))
}
