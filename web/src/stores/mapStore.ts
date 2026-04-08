import { create } from "zustand";
import type { MapLayer, LayerPreset, RecordingSession } from "../types";

const DEFAULT_LAYERS: MapLayer[] = [
  {
    id: "topo-base",
    name: "OpenTopoMap",
    type: "raster",
    visible: true,
    opacity: 1,
    sourceUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
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
