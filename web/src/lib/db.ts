import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { GPSPoint, RecordingSession, LayerPreset } from "../types";

interface TrailForgeDB extends DBSchema {
  points: {
    key: string;
    value: GPSPoint;
    indexes: {
      "by-session": string;
      "by-synced": number;
    };
  };
  sessions: {
    key: string;
    value: RecordingSession;
    indexes: {
      "by-state": string;
    };
  };
  offline_regions: {
    key: string;
    value: {
      id: string;
      name: string;
      bounds: [number, number, number, number];
      minZoom: number;
      maxZoom: number;
      tileCount: number;
      downloadedCount: number;
      status: "pending" | "downloading" | "complete" | "error";
      createdAt: string;
    };
    indexes: {
      "by-status": string;
    };
  };
  layer_presets: {
    key: string;
    value: LayerPreset;
  };
}

let dbPromise: Promise<IDBPDatabase<TrailForgeDB>> | null = null;

function getDB(): Promise<IDBPDatabase<TrailForgeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrailForgeDB>("trailforge", 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const pointStore = db.createObjectStore("points", {
            keyPath: "id",
          });
          pointStore.createIndex("by-session", "sessionId");
          pointStore.createIndex("by-synced", "synced");

          const sessionStore = db.createObjectStore("sessions", {
            keyPath: "id",
          });
          sessionStore.createIndex("by-state", "state");
        }

        if (oldVersion < 2) {
          const regionStore = db.createObjectStore("offline_regions", {
            keyPath: "id",
          });
          regionStore.createIndex("by-status", "status");
        }

        if (oldVersion < 3) {
          db.createObjectStore("layer_presets", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// ---- Points ----

export async function savePoint(point: GPSPoint): Promise<void> {
  const db = await getDB();
  await db.put("points", point);
}

export async function getUnsyncedPoints(
  limit = 100
): Promise<GPSPoint[]> {
  const db = await getDB();
  const tx = db.transaction("points", "readonly");
  const index = tx.store.index("by-synced");
  const points: GPSPoint[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(0));
  while (cursor && points.length < limit) {
    points.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return points;
}

export async function markPointsSynced(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("points", "readwrite");
  for (const id of ids) {
    const point = await tx.store.get(id);
    if (point) {
      point.synced = 1;
      await tx.store.put(point);
    }
  }
  await tx.done;
}

export async function getPointsBySession(
  sessionId: string
): Promise<GPSPoint[]> {
  const db = await getDB();
  return db.getAllFromIndex("points", "by-session", sessionId);
}

// ---- Sessions ----

export async function saveSession(session: RecordingSession): Promise<void> {
  const db = await getDB();
  await db.put("sessions", session);
}

export async function getSession(
  id: string
): Promise<RecordingSession | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

export async function getOrphanedSessions(): Promise<RecordingSession[]> {
  const db = await getDB();
  const tx = db.transaction("sessions", "readonly");
  const index = tx.store.index("by-state");
  const orphaned: RecordingSession[] = [];

  for (const state of ["recording", "paused"] as const) {
    let cursor = await index.openCursor(IDBKeyRange.only(state));
    while (cursor) {
      orphaned.push(cursor.value);
      cursor = await cursor.continue();
    }
  }

  await tx.done;
  return orphaned;
}

// ---- Layer Presets ----

export async function saveLayerPreset(preset: LayerPreset): Promise<void> {
  const db = await getDB();
  await db.put("layer_presets", preset);
}

export async function getLayerPresets(): Promise<LayerPreset[]> {
  const db = await getDB();
  return db.getAll("layer_presets");
}

export async function deleteLayerPreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("layer_presets", id);
}
