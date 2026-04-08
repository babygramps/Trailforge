import type { Geometry } from "geojson";

export type ActivityType = "bike" | "hike" | "paddle";

export type RecordingState =
  | "recording"
  | "paused"
  | "finalizing"
  | "complete"
  | "recovered";

export interface TrackStats {
  distance: number; // metres
  duration: number; // seconds
  elevationGain: number; // metres
  elevationLoss: number; // metres
  avgSpeed: number; // m/s
  hrZones: number[] | null; // time-in-zone array (if HR data available)
}

export interface Track {
  id: string;
  userId: string;
  name: string;
  activityType: ActivityType;
  description: string;
  geometry: Geometry;
  stats: TrackStats;
  createdAt: string;
  updatedAt: string;
}

export interface Waypoint {
  id: string;
  userId: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  ele: number | null;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Route {
  id: string;
  userId: string;
  name: string;
  activityType: ActivityType;
  description: string;
  geometry: Geometry;
  waypoints: Waypoint[];
  totalDistance: number;
  estimatedDuration: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface RecordingSession {
  id: string;
  trackId: string;
  state: RecordingState;
  startedAt: string;
  lastPointAt: string | null;
  pointCount: number;
  batchSeq: number;
}

export interface GPSPoint {
  id: string;
  sessionId: string;
  lat: number;
  lon: number;
  ele: number | null;
  speed: number | null;
  timestamp: string;
  accuracy: number;
  synced: 0 | 1; // indexed as number for IDB range queries
}

export interface LayerPreset {
  id: string;
  name: string;
  layers: Record<string, { visible: boolean; opacity: number }>;
}

export interface MapLayer {
  id: string;
  name: string;
  type: "raster" | "vector" | "geojson";
  visible: boolean;
  opacity: number;
  sourceUrl: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}
