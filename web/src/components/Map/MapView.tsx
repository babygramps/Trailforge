import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapStore } from "../../stores/mapStore";
import { apiClient } from "../../api/client";
import { preseedTiles } from "../../lib/tilePreload";
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
    setMapInstance,
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
        glyphs:
          "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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

    // Right-click on desktop / long-press on mobile → open radial menu.
    // Must also prevent the native browser context menu.
    map.on("contextmenu", (e) => {
      e.preventDefault();
      e.originalEvent.preventDefault();
      const store = useMapStore.getState();
      // Close any existing popups first
      store.setSelectedWaypoint(null);
      store.openRadialMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    });
    // Belt-and-suspenders: block native context menu directly on the canvas
    map.getCanvas().addEventListener("contextmenu", (e) => e.preventDefault());

    // Long-press on mobile → open radial menu.
    // Fallback for browsers where contextmenu doesn't fire on long-press.
    {
      let lpTimer: ReturnType<typeof setTimeout> | null = null;
      let startX = 0;
      let startY = 0;
      const HOLD_MS = 500;
      const MOVE_THRESHOLD = 10; // px

      const canvas = map.getCanvas();

      canvas.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { lpTimer && clearTimeout(lpTimer); lpTimer = null; return; }
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        const cx = t.clientX;
        const cy = t.clientY;
        lpTimer = setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          const point = map.unproject([cx - rect.left, cy - rect.top]);
          const store = useMapStore.getState();
          store.setSelectedWaypoint(null);
          store.openRadialMenu({ x: cx, y: cy, lng: point.lng, lat: point.lat });
          lpTimer = null;
        }, HOLD_MS);
      }, { passive: true });

      canvas.addEventListener("touchmove", (e) => {
        if (!lpTimer) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      }, { passive: true });

      canvas.addEventListener("touchend", () => {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      }, { passive: true });

      canvas.addEventListener("touchcancel", () => {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      }, { passive: true });
    }

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

      // Waypoint circles — larger on mobile for tap targets
      map.addLayer({
        id: "waypoints-circle",
        type: "circle",
        source: "user-waypoints",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 14, 10],
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

      // Click/tap on waypoint → select it
      const wpClickLayers = ["waypoints-circle", "waypoints-label"];
      for (const layerId of wpClickLayers) {
        map.on("click", layerId, (e) => {
          if (!e.features || e.features.length === 0) return;
          const props = e.features[0].properties;
          if (!props) return;
          useMapStore.getState().setSelectedWaypoint({
            id: props.id,
            name: props.name ?? "",
            description: props.description ?? "",
            lat: Number(props.lat) || 0,
            lon: Number(props.lon) || 0,
            ele: Number(props.ele) || 0,
            icon: props.icon ?? "pin",
            color: props.color ?? "#FF5722",
          });
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      // Click on empty map → deselect waypoint
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: wpClickLayers.filter((l) => map.getLayer(l)),
        });
        if (!features.length) {
          useMapStore.getState().setSelectedWaypoint(null);
        }
      });

      loadTracks(map);
      loadWaypoints(map);

      // Auto-locate on first visit (no saved view) or if saved view
      // is the world fallback (zoom <= 2).
      const shouldAutoLocate = zoom <= 2;
      if (shouldAutoLocate && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (geo) => {
            const lng = geo.coords.longitude;
            const lat = geo.coords.latitude;
            map.flyTo({ center: [lng, lat], zoom: 14, duration: 1200 });

            // Pre-seed OSM tiles around user so the area works offline
            preseedTiles(lng, lat).catch(() => {});
          },
          () => {
            // Permission denied or unavailable — stay on default/saved view
          },
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
        );
      }
    });

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
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

  // Update live position with heading
  const updateLivePosition = useCallback(
    (lat: number, lon: number, heading: number | null, accuracy: number) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      if (!positionMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "live-position-marker";
        // Outer accuracy ring + inner dot + heading arrow
        el.innerHTML = `
          <div class="position-accuracy"></div>
          <div class="position-dot"></div>
          <div class="position-heading"></div>
        `;
        positionMarkerRef.current = new maplibregl.Marker({
          element: el,
          pitchAlignment: "map",
          rotationAlignment: "map",
        })
          .setLngLat([lon, lat])
          .addTo(map);
      } else {
        positionMarkerRef.current.setLngLat([lon, lat]);
      }

      const el = positionMarkerRef.current.getElement();

      // Update heading arrow visibility and rotation
      const headingEl = el.querySelector(".position-heading") as HTMLElement;
      if (headingEl) {
        if (heading !== null && !isNaN(heading)) {
          headingEl.style.display = "block";
          headingEl.style.transform = `rotate(${heading}deg)`;
        } else {
          headingEl.style.display = "none";
        }
      }

      // Scale accuracy ring relative to map (approximate)
      const accEl = el.querySelector(".position-accuracy") as HTMLElement;
      if (accEl && accuracy > 0) {
        // Convert meters to pixels at current zoom
        const metersPerPixel =
          (40075016.686 * Math.cos((lat * Math.PI) / 180)) /
          Math.pow(2, map.getZoom() + 8);
        const radiusPx = Math.min(Math.max(accuracy / metersPerPixel, 12), 120);
        accEl.style.width = `${radiusPx * 2}px`;
        accEl.style.height = `${radiusPx * 2}px`;
        accEl.style.display = accuracy > 10 ? "block" : "none";
      }
    },
    []
  );

  // Show live position with heading on the map (always, not just while recording)
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (geo) => {
        updateLivePosition(
          geo.coords.latitude,
          geo.coords.longitude,
          geo.coords.heading,
          geo.coords.accuracy
        );
      },
      () => {
        // Silently ignore — user may not have granted permission yet
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
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

export async function loadWaypoints(map: maplibregl.Map): Promise<void> {
  try {
    const waypoints: Waypoint[] = await apiClient.getWaypoints();
    const features = waypoints.map((w) => ({
      type: "Feature" as const,
      properties: {
        id: w.id,
        name: w.name,
        description: w.description ?? "",
        lat: w.lat,
        lon: w.lon,
        ele: w.ele ?? 0,
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
