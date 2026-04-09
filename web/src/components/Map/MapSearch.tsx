import { useState, useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "../../stores/mapStore";

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    type?: string;
    extent?: [number, number, number, number]; // bbox [w, s, e, n]
  };
}

interface PhotonResponse {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

function formatResult(f: PhotonFeature): { title: string; subtitle: string } {
  const p = f.properties;
  const title = p.name || p.street || "Unknown";
  const parts: string[] = [];
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.country) parts.push(p.country);
  const subtitle = parts.join(", ");
  return { title, subtitle };
}

function resultIcon(f: PhotonFeature): string {
  const key = f.properties.osm_key ?? "";
  const value = f.properties.osm_value ?? "";
  if (key === "highway" && value === "path") return "\u{1F6B6}"; // walking
  if (key === "natural" && value === "peak") return "\u26F0\uFE0F"; // mountain
  if (key === "waterway") return "\u{1F30A}"; // water
  if (key === "tourism") return "\u{1F3D5}\uFE0F"; // camping
  if (key === "amenity") return "\u{1F4CD}"; // pin
  if (key === "place") return "\u{1F3D8}\uFE0F"; // city
  return "\u{1F50D}"; // magnifier fallback
}

export default function MapSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("Search failed");
      const data: PhotonResponse = await res.json();
      setResults(data.features);
      setOpen(data.features.length > 0);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  const removeMarker = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, []);

  const placeMarker = useCallback((lng: number, lat: number, title: string) => {
    const map = useMapStore.getState().mapInstance;
    if (!map) return;

    removeMarker();

    const el = document.createElement("div");
    el.className = "search-pin";
    el.innerHTML = `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#ef4444"/>
      <circle cx="14" cy="14" r="6" fill="#fff"/>
    </svg>`;

    const popup = new maplibregl.Popup({ offset: [0, -36], closeButton: false })
      .setText(title);

    markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);

    markerRef.current.togglePopup();
  }, [removeMarker]);

  const selectResult = (feature: PhotonFeature) => {
    const map = useMapStore.getState().mapInstance;
    if (!map) return;

    const [lng, lat] = feature.geometry.coordinates;
    const extent = feature.properties.extent;

    if (extent) {
      map.fitBounds(
        [
          [extent[0], extent[1]],
          [extent[2], extent[3]],
        ],
        { padding: 60, maxZoom: 16, duration: 1200 }
      );
    } else {
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
    }

    placeMarker(lng, lat, feature.properties.name || "Search result");
    setQuery(feature.properties.name || "");
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    removeMarker();
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as Element).closest(".map-search");
      if (!el) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="map-search">
      <div className="search-input-wrap">
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search trails, places..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {query && (
          <button className="search-clear" onClick={clear} aria-label="Clear search">
            &times;
          </button>
        )}
        {loading && <div className="search-spinner" />}
      </div>
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((f, i) => {
            const { title, subtitle } = formatResult(f);
            return (
              <li
                key={i}
                className="search-result-item"
                role="option"
                onClick={() => selectResult(f)}
              >
                <span className="result-icon">{resultIcon(f)}</span>
                <div className="result-text">
                  <span className="result-title">{title}</span>
                  {subtitle && <span className="result-subtitle">{subtitle}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
