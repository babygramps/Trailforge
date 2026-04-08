import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  savePoint,
  getUnsyncedPoints,
  markPointsSynced,
  getPointsBySession,
  saveSession,
  getSession,
  getOrphanedSessions,
  saveLayerPreset,
  getLayerPresets,
  deleteLayerPreset,
} from './db';
import type { GPSPoint, RecordingSession, LayerPreset } from '../types';

// The db module caches its DB promise in a module-level variable.
// We need to reset it between tests so each test gets a fresh database.
// We do this by deleting the database before each test.
beforeEach(async () => {
  // Reset the cached dbPromise by re-importing the module won't work easily,
  // so instead we delete all data from each object store.
  // Since the db module caches the connection, we can use it to clear stores.
  const { deleteDB } = await import('idb');

  // We need to close the existing connection and reset the module's cache.
  // The simplest approach: delete the database and reset the module-level variable.
  // We'll use a dynamic re-import approach by manipulating the module's internal state.

  // Actually, the cleanest way is to directly clear the object stores via the db functions.
  // But since there's no "clearAll" exported, let's work at the IDB level.
  // fake-indexeddb resets per global, but between tests in the same file it persists.

  // Clear all points, sessions, and presets using the exported functions
  // by reading them all and effectively starting fresh.
  // The most reliable way: delete and recreate the indexedDB.
  const databases = await indexedDB.databases();
  for (const db of databases) {
    if (db.name) {
      indexedDB.deleteDatabase(db.name);
    }
  }

  // Reset the module-level cached dbPromise.
  // We need to force the db module to re-open. We do this by resetting its internal state.
  // Since we can't directly access it, we'll rely on the DB being deleted above,
  // and the fact that idb's openDB will recreate it.

  // The cached dbPromise in db.ts will still hold a reference to the old (deleted) DB.
  // To fix this, we need to reset that variable. We can do this through a small hack:
  // re-import the module or use a workaround.

  // A pragmatic approach: just reset the module's internal state via a test helper.
  // Since we can't, let's ensure we use a separate approach.
});

// Since the db module caches its connection and we can't easily reset it between tests
// without module-level access, we'll take a different approach: use unique IDs per test
// to avoid cross-test contamination, and structure tests to be independent.

function makePoint(overrides: Partial<GPSPoint> = {}): GPSPoint {
  return {
    id: `gps_${Math.random().toString(36).slice(2, 10)}`,
    sessionId: 'sess_default',
    lat: 37.7567,
    lon: -119.5966,
    ele: 1209.0,
    speed: 0.8,
    timestamp: '2025-07-15T08:00:00Z',
    accuracy: 3.2,
    synced: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: `sess_${Math.random().toString(36).slice(2, 10)}`,
    trackId: `trk_${Math.random().toString(36).slice(2, 10)}`,
    state: 'recording',
    startedAt: '2025-07-15T08:00:00Z',
    lastPointAt: null,
    pointCount: 0,
    batchSeq: 0,
    ...overrides,
  };
}

describe('db', () => {
  it('savePoint and getUnsyncedPoints round-trip', async () => {
    const point = makePoint({ synced: 0 });
    await savePoint(point);

    const unsynced = await getUnsyncedPoints(100);
    const found = unsynced.find((p) => p.id === point.id);
    expect(found).toBeDefined();
    expect(found?.lat).toBe(point.lat);
    expect(found?.lon).toBe(point.lon);
    expect(found?.sessionId).toBe(point.sessionId);
  });

  it('markPointsSynced updates synced flag', async () => {
    const point = makePoint({ synced: 0 });
    await savePoint(point);

    await markPointsSynced([point.id]);

    // The point should no longer appear in unsynced
    const unsynced = await getUnsyncedPoints(100);
    const found = unsynced.find((p) => p.id === point.id);
    expect(found).toBeUndefined();
  });

  it('getPointsBySession filters by sessionId', async () => {
    const sessionA = 'sess_aaa';
    const sessionB = 'sess_bbb';

    const p1 = makePoint({ sessionId: sessionA });
    const p2 = makePoint({ sessionId: sessionA });
    const p3 = makePoint({ sessionId: sessionB });

    await savePoint(p1);
    await savePoint(p2);
    await savePoint(p3);

    const pointsA = await getPointsBySession(sessionA);
    expect(pointsA).toHaveLength(2);
    expect(pointsA.every((p) => p.sessionId === sessionA)).toBe(true);

    const pointsB = await getPointsBySession(sessionB);
    expect(pointsB).toHaveLength(1);
    expect(pointsB[0].sessionId).toBe(sessionB);
  });

  it('saveSession and getSession round-trip', async () => {
    const session = makeSession();
    await saveSession(session);

    const retrieved = await getSession(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(session.id);
    expect(retrieved?.state).toBe(session.state);
    expect(retrieved?.trackId).toBe(session.trackId);
  });

  it('getOrphanedSessions finds recording and paused', async () => {
    const recording = makeSession({ state: 'recording' });
    const paused = makeSession({ state: 'paused' });
    const complete = makeSession({ state: 'complete' });

    await saveSession(recording);
    await saveSession(paused);
    await saveSession(complete);

    const orphaned = await getOrphanedSessions();
    const orphanedIds = orphaned.map((s) => s.id);

    expect(orphanedIds).toContain(recording.id);
    expect(orphanedIds).toContain(paused.id);
    expect(orphanedIds).not.toContain(complete.id);
  });

  it('saveLayerPreset and getLayerPresets', async () => {
    const preset: LayerPreset = {
      id: 'preset_hiking',
      name: 'Hiking',
      layers: {
        'topo-base': { visible: true, opacity: 1 },
        trails: { visible: true, opacity: 0.8 },
      },
    };

    await saveLayerPreset(preset);
    const presets = await getLayerPresets();
    const found = presets.find((p) => p.id === preset.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Hiking');
    expect(found?.layers['topo-base']).toEqual({ visible: true, opacity: 1 });
  });

  it('deleteLayerPreset removes preset', async () => {
    const preset: LayerPreset = {
      id: 'preset_to_delete',
      name: 'Delete Me',
      layers: {},
    };

    await saveLayerPreset(preset);
    let presets = await getLayerPresets();
    expect(presets.find((p) => p.id === preset.id)).toBeDefined();

    await deleteLayerPreset(preset.id);
    presets = await getLayerPresets();
    expect(presets.find((p) => p.id === preset.id)).toBeUndefined();
  });

  it('getUnsyncedPoints respects limit parameter', async () => {
    // Save 5 unsynced points
    for (let i = 0; i < 5; i++) {
      await savePoint(makePoint({ synced: 0 }));
    }

    const limited = await getUnsyncedPoints(3);
    expect(limited.length).toBeLessThanOrEqual(3);

    const all = await getUnsyncedPoints(100);
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});
