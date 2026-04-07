package service

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"time"

	"github.com/babygramps/trailforge/internal/model"
)

// GPX XML structures

// GPXFile is the root GPX document.
type GPXFile struct {
	XMLName xml.Name  `xml:"gpx"`
	Version string    `xml:"version,attr"`
	Creator string    `xml:"creator,attr"`
	XMLNS   string    `xml:"xmlns,attr"`
	Tracks  []GPXTrk  `xml:"trk"`
}

// GPXTrk represents a GPX track.
type GPXTrk struct {
	Name     string      `xml:"name"`
	Type     string      `xml:"type,omitempty"`
	Desc     string      `xml:"desc,omitempty"`
	Segments []GPXTrkSeg `xml:"trkseg"`
}

// GPXTrkSeg is a contiguous segment of track points.
type GPXTrkSeg struct {
	Points []GPXTrkPt `xml:"trkpt"`
}

// GPXTrkPt is a single track point.
type GPXTrkPt struct {
	Lat  float64    `xml:"lat,attr"`
	Lon  float64    `xml:"lon,attr"`
	Ele  *float64   `xml:"ele,omitempty"`
	Time *time.Time `xml:"time,omitempty"`
}

// geoJSON helpers for parsing geometry from the database.
type geoJSONGeometry struct {
	Type        string      `json:"type"`
	Coordinates [][]float64 `json:"coordinates"`
}

// ParseGPX parses raw GPX XML bytes into a Track model.
// It extracts the first track segment and converts it to a GeoJSON LineStringZ.
func ParseGPX(data []byte) (*model.Track, error) {
	var gpx GPXFile
	if err := xml.Unmarshal(data, &gpx); err != nil {
		return nil, fmt.Errorf("invalid GPX XML: %w", err)
	}

	if len(gpx.Tracks) == 0 {
		return nil, fmt.Errorf("GPX file contains no tracks")
	}

	trk := gpx.Tracks[0]

	// Collect all points across segments.
	var coords [][]float64
	for _, seg := range trk.Segments {
		for _, pt := range seg.Points {
			coord := []float64{pt.Lon, pt.Lat}
			if pt.Ele != nil {
				coord = append(coord, *pt.Ele)
			}
			coords = append(coords, coord)
		}
	}

	if len(coords) < 2 {
		return nil, fmt.Errorf("GPX track has fewer than 2 points")
	}

	geom := geoJSONGeometry{
		Type:        "LineString",
		Coordinates: coords,
	}
	geomJSON, err := json.Marshal(geom)
	if err != nil {
		return nil, fmt.Errorf("marshalling GeoJSON: %w", err)
	}

	// Compute basic stats from the point data.
	stats := computeTrackStats(trk)
	statsJSON, _ := json.Marshal(stats)

	track := &model.Track{
		Name:         trk.Name,
		ActivityType: activityFromGPXType(trk.Type),
		Description:  trk.Desc,
		Geometry:     json.RawMessage(geomJSON),
		Stats:        json.RawMessage(statsJSON),
	}

	return track, nil
}

// GenerateGPX converts a Track model back to GPX XML bytes.
func GenerateGPX(t *model.Track) ([]byte, error) {
	var geom geoJSONGeometry
	if err := json.Unmarshal(t.Geometry, &geom); err != nil {
		return nil, fmt.Errorf("parsing track geometry: %w", err)
	}

	var points []GPXTrkPt
	for _, coord := range geom.Coordinates {
		pt := GPXTrkPt{
			Lon: coord[0],
			Lat: coord[1],
		}
		if len(coord) >= 3 {
			ele := coord[2]
			pt.Ele = &ele
		}
		points = append(points, pt)
	}

	gpx := GPXFile{
		Version: "1.1",
		Creator: "TrailForge",
		XMLNS:   "http://www.topografix.com/GPX/1/1",
		Tracks: []GPXTrk{
			{
				Name: t.Name,
				Type: string(t.ActivityType),
				Desc: t.Description,
				Segments: []GPXTrkSeg{
					{Points: points},
				},
			},
		},
	}

	output, err := xml.MarshalIndent(gpx, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("generating GPX XML: %w", err)
	}

	header := []byte(xml.Header)
	return append(header, output...), nil
}

// computeTrackStats derives basic statistics from GPX track points.
func computeTrackStats(trk GPXTrk) model.TrackStats {
	var stats model.TrackStats
	var prevEle *float64

	for _, seg := range trk.Segments {
		for _, pt := range seg.Points {
			if pt.Ele != nil && prevEle != nil {
				diff := *pt.Ele - *prevEle
				if diff > 0 {
					stats.ElevationGain += diff
				} else {
					stats.ElevationLoss -= diff
				}
			}
			if pt.Ele != nil {
				ele := *pt.Ele
				prevEle = &ele
			}
		}
	}

	// Duration from timestamps if available.
	var firstTime, lastTime *time.Time
	for _, seg := range trk.Segments {
		for i := range seg.Points {
			if seg.Points[i].Time != nil {
				if firstTime == nil {
					firstTime = seg.Points[i].Time
				}
				lastTime = seg.Points[i].Time
			}
		}
	}
	if firstTime != nil && lastTime != nil {
		stats.Duration = lastTime.Sub(*firstTime).Seconds()
	}

	return stats
}

// activityFromGPXType maps a GPX <type> string to an ActivityType.
func activityFromGPXType(gpxType string) model.ActivityType {
	switch gpxType {
	case "cycling", "bike", "biking":
		return model.ActivityBike
	case "paddling", "paddle", "kayak", "canoe":
		return model.ActivityPaddle
	default:
		return model.ActivityHike
	}
}
