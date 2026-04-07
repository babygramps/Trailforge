import { create } from "zustand";
import type { MapLayer, LayerPreset, RecordingSession } from "../types";

const DEFAULT_LAYERS: MapLayer[] = [
  {
    id: "topo-base",
    name: "Topo Base",
    type: "vector",
    visible: true,
    opacity: 1,
    sourceUrl: "/tiles/styles/topo/style.json",
  },
  {
    id: "satellite",
    name: "Satellite",
    type: "raster",
    visible: false,
    opacity: 1,
    sourceUrl: "/api/proxy/satellite/{z}/{x}/{y}",
  },
  {
    id: "hillshade",
    name: "Hillshade",
    type: "raster",
    visible: true,
    opacity: 0.3,
    sourceUrl: "/tiles/data/hillshade/{z}/{x}/{y}.png",
  },
  {
    id: "contours",
    name: "Contours",
    type: "vector",
    visible: true,
    opacity: 0.6,
    sourceUrl: "/tiles/data/contours/{z}/{x}/{y}.pbf",
  },
  {
    id: "public-land",
    name: "Public Land",
    type: "vector",
    visible: false,
    opacity: 0.4,
    sourceUrl: "/tiles/data/public-land/{z}/{x}/{y}.pbf",
  },
  {
    id: "trails",
    name: "Trail Network",
    type: "vector",
    visible: true,
    opacity: 0.8,
    sourceUrl: "/tiles/data/trails/{z}/{x}/{y}.pbf",
  },
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

interface MapState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  layers: MapLayer[];
  activePreset: string | null;
  selectedTrackId: string | null;
  isRecording: boolean;
  recordingSession: RecordingSession | null;

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
}

export const useMapStore = create<MapState>((set) => ({
  center: [-119.5383, 37.8651], // Yosemite default
  zoom: 10,
  bearing: 0,
  pitch: 0,
  layers: DEFAULT_LAYERS,
  activePreset: null,
  selectedTrackId: null,
  isRecording: false,
  recordingSession: null,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBearing: (bearing) => set({ bearing }),
  setPitch: (pitch) => set({ pitch }),

  setView: (center, zoom) => set({ center, zoom }),

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
}));
