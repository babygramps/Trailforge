// Package testdata provides shared test fixture data for TrailForge API tests.
package testdata

// YosemiteTrailGeoJSON is a 20-point LineStringZ GeoJSON along the Yosemite Valley Loop Trail,
// starting near the Yosemite Falls trailhead. Elevation rises to ~1331m then descends.
const YosemiteTrailGeoJSON = `{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-119.5966, 37.7567, 1209.0],
      [-119.5963, 37.7571, 1215.4],
      [-119.5958, 37.7576, 1223.1],
      [-119.5952, 37.7580, 1232.7],
      [-119.5947, 37.7585, 1241.3],
      [-119.5941, 37.7589, 1251.8],
      [-119.5935, 37.7593, 1263.2],
      [-119.5930, 37.7597, 1274.6],
      [-119.5924, 37.7601, 1286.0],
      [-119.5919, 37.7605, 1298.5],
      [-119.5914, 37.7609, 1312.1],
      [-119.5910, 37.7612, 1325.0],
      [-119.5907, 37.7615, 1331.0],
      [-119.5903, 37.7618, 1325.8],
      [-119.5899, 37.7620, 1314.2],
      [-119.5895, 37.7622, 1300.6],
      [-119.5891, 37.7624, 1285.9],
      [-119.5888, 37.7625, 1268.3],
      [-119.5884, 37.7627, 1248.1],
      [-119.5880, 37.7629, 1228.0]
    ]
  },
  "properties": {}
}`

// YosemiteTrackStats is a JSONB string with computed statistics for the Yosemite trail fixture.
const YosemiteTrackStats = `{"distance_m": 1847.3, "duration_s": 2400.0, "elevation_gain_m": 122.0, "elevation_loss_m": 103.0, "avg_speed_mps": 0.77}`

// NYCPointGeoJSON is a LineStringZ in Central Park, NYC, used for spatial isolation tests
// (ensuring Yosemite queries do not return NYC data and vice versa).
const NYCPointGeoJSON = `{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-73.9712, 40.7831, 25.0],
      [-73.9708, 40.7835, 26.1],
      [-73.9703, 40.7840, 27.3],
      [-73.9698, 40.7844, 26.8],
      [-73.9694, 40.7849, 25.5]
    ]
  },
  "properties": {}
}`

// HalfDomeWaypoint coordinates.
const (
	HalfDomeWaypointLat = 37.7459
	HalfDomeWaypointLon = -119.5332
	HalfDomeWaypointEle = 2693.0
)

// ElCapitanWaypoint coordinates.
const (
	ElCapitanWaypointLat = 37.7341
	ElCapitanWaypointLon = -119.6377
	ElCapitanWaypointEle = 2307.0
)

// Test user credentials and identity.
const (
	TestUserEmail       = "hiker@test.trailforge.io"
	TestUserPassword    = "trailforge-test-2024"
	TestUserDisplayName = "Test Hiker"
	TestJWTSecret       = "test-jwt-secret-for-unit-tests"
)
