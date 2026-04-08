import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { SyncManager } from '../lib/sync';
import { savePoint, getUnsyncedPoints } from '../lib/db';
import type { GPSPoint } from '../types';

// Track API calls
const appendPointsCalls: Array<{ sessionId: string; points: unknown[] }> = [];

const server = setupServer(
  http.post('/api/tracks/sessions/:sessionId/points', async ({ params, request }) => {
    const body = await request.json() as { points: unknown[] };
    appendPointsCalls.push({
      sessionId: params.sessionId as string,
      points: body.points,
    });
    return HttpResponse.json({ appended: body.points.length });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  appendPointsCalls.length = 0;
});
afterAll(() => server.close());

function makePoint(sessionId: string, index: number): GPSPoint {
  const baseTime = new Date('2025-07-15T08:00:00Z').getTime();
  return {
    id: `point-${sessionId}-${index}`,
    sessionId,
    lat: 37.7567 + index * 0.0001,
    lon: -119.5966 + index * 0.0001,
    ele: 1209 + index,
    speed: 1.2,
    timestamp: new Date(baseTime + index * 5000).toISOString(),
    accuracy: 10,
    synced: 0,
  };
}

describe('Sync Flow Integration', () => {
  it('flushes all unsynced points grouped by session', async () => {
    // Seed 10 points for session A, 5 for session B
    for (let i = 0; i < 10; i++) {
      await savePoint(makePoint('session-a', i));
    }
    for (let i = 0; i < 5; i++) {
      await savePoint(makePoint('session-b', i));
    }

    // Verify unsynced count
    const before = await getUnsyncedPoints(100);
    expect(before.length).toBe(15);

    // Flush
    const manager = new SyncManager(60_000);
    await manager.flush();

    // All points should be synced
    const after = await getUnsyncedPoints(100);
    expect(after.length).toBe(0);

    // API should have been called with both sessions
    const sessionIds = appendPointsCalls.map((c) => c.sessionId);
    expect(sessionIds).toContain('session-a');
    expect(sessionIds).toContain('session-b');
  });

  it('status callback fires during sync', async () => {
    await savePoint(makePoint('session-c', 0));
    await savePoint(makePoint('session-c', 1));

    const statusUpdates: Array<{ syncing: boolean; pending: number }> = [];

    const manager = new SyncManager(60_000);
    manager.setStatusCallback((syncing, pending) => {
      statusUpdates.push({ syncing, pending });
    });

    await manager.flush();

    // Should have at least a start (syncing=true) and end (syncing=false)
    expect(statusUpdates.length).toBeGreaterThanOrEqual(2);
    expect(statusUpdates[0].syncing).toBe(true);
    expect(statusUpdates[statusUpdates.length - 1].syncing).toBe(false);
    expect(statusUpdates[statusUpdates.length - 1].pending).toBe(0);
  });

  it('skips flush when offline', async () => {
    await savePoint(makePoint('session-d', 0));

    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    const manager = new SyncManager(60_000);
    await manager.flush();

    // Should NOT have called the API
    expect(appendPointsCalls.length).toBe(0);

    // Points should still be unsynced
    const remaining = await getUnsyncedPoints(100);
    expect(remaining.length).toBe(1);

    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true, configurable: true });
  });

  it('retries on API failure then succeeds', async () => {
    await savePoint(makePoint('session-e', 0));

    let callCount = 0;
    server.use(
      http.post('/api/tracks/sessions/:sessionId/points', async ({ request }) => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({ error: 'server error' }, { status: 500 });
        }
        const body = await request.json() as { points: unknown[] };
        return HttpResponse.json({ appended: body.points.length });
      }),
    );

    const manager = new SyncManager(60_000);
    await manager.flush();

    expect(callCount).toBeGreaterThanOrEqual(2);

    const remaining = await getUnsyncedPoints(100);
    expect(remaining.length).toBe(0);
  });
});
