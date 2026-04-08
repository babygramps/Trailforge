import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapStore } from "../../stores/mapStore";
import { apiClient } from "../../api/client";
import type { Track, Waypoint } from "../../types";

// Tile sources keyed by store layer ID.
// Each entry becomes a raster source + layer on the map.
const TILE_SOURCES: Record<
  string,
  { tiles: string[]; tileSize: number; maxzoom: number; attribution: string }
> = {
  "topo-base": {
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 17,
    attribution:
      '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
  osm: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "cyclosm": {
    tiles: ["https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> / OSM',
  },
  "waymarked-hiking": {
    tiles: ["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 18,
    attribution:
      '&copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>',
  },
  "waymarked-cycling": {
    tiles: ["https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 18,
    attribution:
      '&copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>',
  },
};

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const positionMarkerRef = useRef<maplibregl.Marker | null>(null);

  const {
    center,
    zoom,
    bearing,
    pitch,
    layers,
    selectedTrackId,
    setCenter,
    setZoom,
    setBearing,
    setPitch,
  } = useMapStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Build initial sources and layers from TILE_SOURCES
    const sources: Record<string, maplibregl.SourceSpecification> = {};
    const baseLayers: maplibregl.LayerSpecification[] = [];

    for (const [id, src] of Object.entries(TILE_SOURCES)) {
      sources[id] = {
        type: "raster",
        tiles: src.tiles,
        tileSize: src.tileSize,
        maxzoom: src.maxzoom,
        attribution: src.attribution,
      };

      const storeLayer = useMapStore.getState().layers.find((l) => l.id === id);
      baseLayers.push({
        id: `${id}-layer`,
        type: "raster",
        source: id,
        layout: {
          visibility: storeLayer?.visible ? "visible" : "none",
        },
        paint: {
          "raster-opacity": storeLayer?.opacity ?? 1,
        },
      });
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        name: "TrailForge",
        sources,
        layers: baseLayers,
      },
      center: center,
      zoom: zoom,
      bearing: bearing,
      pitch: pitch,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "top-right"
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left"
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );

    map.on("moveend", () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat]);
      setZoom(map.getZoom());
      setBearing(map.getBearing());
      setPitch(map.getPitch());
    });

    map.on("load", () => {
      // User data sources
      map.addSource("user-tracks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("user-waypoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Track lines
      map.addLayer({
        id: "tracks-line",
        type: "line",
        source: "user-tracks",
        paint: {
          "line-color": "#e85d26",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });

      // Selected track highlight
      map.addLayer({
        id: "tracks-line-selected",
        type: "line",
        source: "user-tracks",
        paint: {
          "line-color": "#2563eb",
          "line-width": 5,
          "line-opacity": 0.9,
        },
        filter: ["==", ["get", "id"], ""],
      });

      // Waypoint circles
      map.addLayer({
        id: "waypoints-circle",
        type: "circle",
        source: "user-waypoints",
        paint: {
          "circle-radius": 8,
          "circle-color": ["coalesce", ["get", "color"], "#e85d26"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Waypoint labels
      map.addLayer({
        id: "waypoints-label",
        type: "symbol",
        source: "user-waypoints",
        layout: {
          "text-field": ["get", "name"],
          "text-offset": [0, 1.5],
          "text-size": 12,
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#1a1a2e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      loadTracks(map);
      loadWaypoints(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update selected track filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer("tracks-line-selected")) {
      map.setFilter("tracks-line-selected", [
        "==",
        ["get", "id"],
        selectedTrackId ?? "",
      ]);

      if (selectedTrackId) {
        const source = map.getSource(
          "user-tracks"
        ) as maplibregl.GeoJSONSource;
        if (source) {
          apiClient
            .getTrack(selectedTrackId)
            .then((track) => {
              if (track.geometry) {
                const bounds = new maplibregl.LngLatBounds();
                extractCoords(track.geometry).forEach(([lng, lat]) =>
                  bounds.extend([lng, lat])
                );
                if (!bounds.isEmpty()) {
                  map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
                }
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [selectedTrackId]);

  // Sync ALL layer visibility and opacity from the store to the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const layer of layers) {
      // Raster tile layers use "{id}-layer" naming
      const mapLayerId = `${layer.id}-layer`;
      if (map.getLayer(mapLayerId)) {
        map.setLayoutProperty(
          mapLayerId,
          "visibility",
          layer.visible ? "visible" : "none"
        );
        map.setPaintProperty(mapLayerId, "raster-opacity", layer.opacity);
      }
    }

    // My Tracks
    const trackLayer = layers.find((l) => l.id === "my-tracks");
    if (trackLayer && map.getLayer("tracks-line")) {
      const vis = trackLayer.visible ? "visible" : "none";
      map.setLayoutProperty("tracks-line", "visibility", vis);
      map.setLayoutProperty("tracks-line-selected", "visibility", vis);
      map.setPaintProperty("tracks-line", "line-opacity", trackLayer.opacity);
    }

    // Waypoints
    const wpLayer = layers.find((l) => l.id === "waypoints");
    if (wpLayer && map.getLayer("waypoints-circle")) {
      const vis = wpLayer.visible ? "visible" : "none";
      map.setLayoutProperty("waypoints-circle", "visibility", vis);
      map.setLayoutProperty("waypoints-label", "visibility", vis);
    }
  }, [layers]);

  // Update live position
  const updateLivePosition = useCallback(
    (lat: number, lon: number) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      if (!positionMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "live-position-marker";
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderRadius = "50%";
        el.style.backgroundColor = "#2563eb";
        el.style.border = "3px solid #ffffff";
        el.style.boxShadow = "0 0 8px rgba(37,99,235,0.6)";
        positionMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map);
      } else {
        positionMarkerRef.current.setLngLat([lon, lat]);
      }
    },
    []
  );

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__updateMapPosition =
      updateLivePosition;
    return () => {
      delete (window as unknown as Record<string, unknown>).__updateMapPosition;
    };
  }, [updateLivePosition]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}

async function loadTracks(map: maplibregl.Map): Promise<void> {
  try {
    const tracks: Track[] = await apiClient.getTracks();
    const features = tracks
      .filter((t) => t.geometry)
      .map((t) => ({
        type: "Feature" as const,
        properties: { id: t.id, name: t.name, activityType: t.activityType },
        geometry: t.geometry,
      }));

    const source = map.getSource("user-tracks") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  } catch {
    // Not logged in or network error, ignore
  }
}

async function loadWaypoints(map: maplibregl.Map): Promise<void> {
  try {
    const waypoints: Waypoint[] = await apiClient.getWaypoints();
    const features = waypoints.map((w) => ({
      type: "Feature" as const,
      properties: {
        id: w.id,
        name: w.name,
        icon: w.icon,
        color: w.color,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [w.lon, w.lat, w.ele ?? 0],
      },
    }));

    const source = map.getSource(
      "user-waypoints"
    ) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  } catch {
    // Not logged in or network error, ignore
  }
}

function extractCoords(geojson: GeoJSON.GeoJSON): Array<[number, number]> {
  const coords: Array<[number, number]> = [];

  function walk(g: GeoJSON.GeoJSON) {
    if ("coordinates" in g) {
      flattenCoords(g.coordinates as unknown as number[], coords);
    }
    if ("geometries" in g) {
      for (const sub of (g as GeoJSON.GeometryCollection).geometries) walk(sub);
    }
    if ("features" in g) {
      for (const f of (g as GeoJSON.FeatureCollection).features) {
        if (f.geometry) walk(f.geometry);
      }
    }
    if ("geometry" in g && (g as GeoJSON.Feature).geometry) {
      walk((g as GeoJSON.Feature).geometry!);
    }
  }

  walk(geojson);
  return coords;
}

function flattenCoords(
  input: number[],
  out: Array<[number, number]>
): void {
  if (
    typeof input[0] === "number" &&
    typeof input[1] === "number" &&
    input.length >= 2
  ) {
    if (!Array.isArray(input[0])) {
      out.push([input[0] as number, input[1] as number]);
      return;
    }
  }
  for (const item of input) {
    if (Array.isArray(item)) {
      flattenCoords(item as unknown as number[], out);
    }
  }
}
