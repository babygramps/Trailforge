import { create } from "zustand";
import type maplibregl from "maplibre-gl";
import type { MapLayer, LayerPreset, RecordingSession } from "../types";

// ---- Persist / restore last map view ----
const VIEW_KEY = "tf_map_view";

interface SavedView {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

function loadSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedView;
    if (
      Array.isArray(v.center) &&
      v.center.length === 2 &&
      typeof v.zoom === "number"
    ) {
      return v;
    }
  } catch {
    // Corrupted — ignore
  }
  return null;
}

function persistView(v: SavedView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Storage full — ignore
  }
}

const saved = loadSavedView();

const DEFAULT_LAYERS: MapLayer[] = [
  // ---- Base maps (toggle one at a time, or blend) ----
  {
    id: "topo-base",
    name: "OpenTopoMap",
    type: "raster",
    visible: true,
    opacity: 1,
    sourceUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    type: "raster",
    visible: false,
    opacity: 1,
    sourceUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  {
    id: "cyclosm",
    name: "CyclOSM (Bike)",
    type: "raster",
    visible: false,
    opacity: 1,
    sourceUrl: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  },
  // ---- Overlays (layer on top of base) ----
  {
    id: "waymarked-hiking",
    name: "Hiking Trails",
    type: "raster",
    visible: false,
    opacity: 0.7,
    sourceUrl: "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
  },
  {
    id: "waymarked-cycling",
    name: "Cycling Routes",
    type: "raster",
    visible: false,
    opacity: 0.7,
    sourceUrl: "https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png",
  },
  // ---- User data ----
  {
    id: "my-tracks",
    name: "My Tracks",
    type: "geojson",
    visible: true,
    opacity: 1,
    sourceUrl: "",
  },
  {
    id: "waypoints",
    name: "Waypoints",
    type: "geojson",
    visible: true,
    opacity: 1,
    sourceUrl: "",
  },
];

interface WaypointDraft {
  lng: number;
  lat: number;
}

interface MapState {
  mapInstance: maplibregl.Map | null;
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  layers: MapLayer[];
  activePreset: string | null;
  selectedTrackId: string | null;
  isRecording: boolean;
  recordingSession: RecordingSession | null;
  waypointDraft: WaypointDraft | null;

  setMapInstance: (map: maplibregl.Map | null) => void;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBearing: (bearing: number) => void;
  setPitch: (pitch: number) => void;
  setView: (center: [number, number], zoom: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  applyPreset: (preset: LayerPreset) => void;
  setSelectedTrack: (trackId: string | null) => void;
  setRecording: (
    isRecording: boolean,
    session: RecordingSession | null
  ) => void;
  setWaypointDraft: (draft: WaypointDraft | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  mapInstance: null,
  center: saved?.center ?? [0, 20],
  zoom: saved?.zoom ?? 2,
  bearing: saved?.bearing ?? 0,
  pitch: saved?.pitch ?? 0,
  layers: DEFAULT_LAYERS,
  activePreset: null,
  selectedTrackId: null,
  isRecording: false,
  recordingSession: null,
  waypointDraft: null,

  setMapInstance: (map) => set({ mapInstance: map }),
  setCenter: (center) =>
    set((state) => {
      persistView({ center, zoom: state.zoom, bearing: state.bearing, pitch: state.pitch });
      return { center };
    }),
  setZoom: (zoom) =>
    set((state) => {
      persistView({ center: state.center, zoom, bearing: state.bearing, pitch: state.pitch });
      return { zoom };
    }),
  setBearing: (bearing) =>
    set((state) => {
      persistView({ center: state.center, zoom: state.zoom, bearing, pitch: state.pitch });
      return { bearing };
    }),
  setPitch: (pitch) =>
    set((state) => {
      persistView({ center: state.center, zoom: state.zoom, bearing: state.bearing, pitch });
      return { pitch };
    }),

  setView: (center, zoom) =>
    set((state) => {
      persistView({ center, zoom, bearing: state.bearing, pitch: state.pitch });
      return { center, zoom };
    }),

  toggleLayerVisibility: (layerId) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      ),
      activePreset: null,
    })),

  setLayerOpacity: (layerId, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, opacity } : l
      ),
      activePreset: null,
    })),

  applyPreset: (preset) =>
    set((state) => ({
      layers: state.layers.map((l) => {
        const config = preset.layers[l.id];
        if (config) {
          return { ...l, visible: config.visible, opacity: config.opacity };
        }
        return l;
      }),
      activePreset: preset.id,
    })),

  setSelectedTrack: (trackId) => set({ selectedTrackId: trackId }),

  setRecording: (isRecording, session) =>
    set({ isRecording, recordingSession: session }),

  setWaypointDraft: (draft) => set({ waypointDraft: draft }),
}));
