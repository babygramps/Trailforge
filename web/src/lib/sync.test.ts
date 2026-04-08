import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import 'fake-indexeddb/auto';
import { SyncManager } from './sync';
import { savePoint, getUnsyncedPoints } from './db';
import type { GPSPoint } from '../types';

let appendCallCount = 0;
let appendCalls: Array<{ sessionId: string; body: unknown }> = [];

const server = setupServer(
  http.post('/api/tracks/sessions/:sessionId/points', async ({ params, request }) => {
    appendCallCount++;
    const body = await request.json();
    appendCalls.push({ sessionId: params.sessionId as string, body });
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterAll(() => server.close());

function makePoint(overrides: Partial<GPSPoint> = {}): GPSPoint {
  return {
    id: `gps_${Math.random().toString(36).slice(2, 10)}`,
    sessionId: 'sess_001',
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

describe('SyncManager', () => {
  beforeEach(() => {
    appendCallCount = 0;
    appendCalls = [];
    server.resetHandlers();
  });

  it('flush sends unsynced points in batches', async () => {
    for (let i = 0; i < 3; i++) {
      await savePoint(makePoint());
    }

    const manager = new SyncManager(60_000);
    await manager.flush();

    expect(appendCallCount).toBeGreaterThanOrEqual(1);
  });

  it('flush groups points by session', async () => {
    await savePoint(makePoint({ sessionId: 'sess_aaa' }));
    await savePoint(makePoint({ sessionId: 'sess_aaa' }));
    await savePoint(makePoint({ sessionId: 'sess_bbb' }));

    const manager = new SyncManager(60_000);
    await manager.flush();

    const sessionIds = appendCalls.map((c) => c.sessionId);
    expect(sessionIds).toContain('sess_aaa');
    expect(sessionIds).toContain('sess_bbb');
  });

  it('flush marks points as synced after successful send', async () => {
    const point = makePoint();
    await savePoint(point);

    const manager = new SyncManager(60_000);
    await manager.flush();

    const remaining = await getUnsyncedPoints(100);
    const found = remaining.find((p) => p.id === point.id);
    expect(found).toBeUndefined();
  });

  it('flush skips when no unsynced points', async () => {
    const manager = new SyncManager(60_000);
    await manager.flush();

    expect(appendCallCount).toBe(0);
  });

  it('flush handles API errors gracefully', async () => {
    server.use(
      http.post('/api/tracks/sessions/:sessionId/points', () => {
        return new HttpResponse('Server Error', { status: 500 });
      }),
    );

    await savePoint(makePoint());

    const manager = new SyncManager(60_000);
    // Use fake timers to avoid waiting for real exponential backoff delays.
    // shouldAdvanceTime keeps IDB microtasks flowing while setTimeout calls
    // are resolved instantly by advanceTimersByTimeAsync.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const flushPromise = manager.flush();
    // Advance enough to cover all retry delays (sum of 1s + 2s + 4s + 8s + jitter)
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(flushPromise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('retry with exponential backoff on failure', async () => {
    let callCount = 0;
    server.use(
      http.post('/api/tracks/sessions/:sessionId/points', () => {
        callCount++;
        if (callCount < 3) {
          return new HttpResponse('Server Error', { status: 500 });
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await savePoint(makePoint());

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const manager = new SyncManager(60_000);
    const flushPromise = manager.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromise;
    vi.useRealTimers();

    // Should have been called at least 3 times (2 failures + 1 success)
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('statusCallback fires with correct state', async () => {
    await savePoint(makePoint());

    const manager = new SyncManager(60_000);
    const statusUpdates: Array<{ syncing: boolean; pending: number }> = [];

    manager.setStatusCallback((syncing, pending) => {
      statusUpdates.push({ syncing, pending });
    });

    await manager.flush();

    // Should have at least a start (syncing=true) and end (syncing=false) callback
    expect(statusUpdates.length).toBeGreaterThanOrEqual(2);
    expect(statusUpdates[0].syncing).toBe(true);
    expect(statusUpdates[statusUpdates.length - 1].syncing).toBe(false);
  });

  it('start begins periodic sync', () => {
    const manager = new SyncManager(1000);
    const addEventSpy = vi.spyOn(window, 'addEventListener');

    manager.start();

    expect(addEventSpy).toHaveBeenCalledWith('online', expect.any(Function));

    manager.stop();
    addEventSpy.mockRestore();
  });

  it('stop clears timer', () => {
    vi.useFakeTimers();

    const manager = new SyncManager(1000);
    manager.start();
    manager.stop();

    // After stopping, advancing timers should not trigger any flush
    const flushSpy = vi.spyOn(manager, 'flush');
    vi.advanceTimersByTime(5000);

    expect(flushSpy).not.toHaveBeenCalled();
    flushSpy.mockRestore();

    vi.useRealTimers();
  });
});
