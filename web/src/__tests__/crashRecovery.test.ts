import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { saveSession, getOrphanedSessions, getSession } from '../lib/db';
import type { RecordingSession } from '../types';

// Mock navigator.geolocation
const mockWatchPosition = vi.fn();
const mockClearWatch = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
    },
    writable: true,
    configurable: true,
  });
  mockWatchPosition.mockReset();
  mockClearWatch.mockReset();
});

// Must import after mock setup since useGPS reads navigator.geolocation
const { useGPS } = await import('../hooks/useGPS');

describe('Crash Recovery Integration', () => {
  it('recovers orphaned recording session on mount', async () => {
    // Simulate a crash: pre-seed IDB with a "recording" session
    const orphanedSession: RecordingSession = {
      id: 'orphaned-session-123',
      trackId: 'track-123',
      state: 'recording',
      startedAt: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
      lastPointAt: new Date(Date.now() - 1800_000).toISOString(),
      pointCount: 42,
      batchSeq: 3,
    };
    await saveSession(orphanedSession);

    // Verify it's marked as orphaned
    const orphanedBefore = await getOrphanedSessions();
    expect(orphanedBefore.length).toBeGreaterThanOrEqual(1);
    expect(orphanedBefore.some((s) => s.id === 'orphaned-session-123')).toBe(true);

    // Mount the GPS hook — it should detect and recover
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useGPS());

    // Wait for recovery to complete
    await waitFor(async () => {
      const recovered = await getSession('orphaned-session-123');
      expect(recovered?.state).toBe('recovered');
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Recovered'),
    );
    consoleSpy.mockRestore();
  });

  it('recovers orphaned paused session on mount', async () => {
    const pausedSession: RecordingSession = {
      id: 'paused-session-456',
      trackId: 'track-456',
      state: 'paused',
      startedAt: new Date(Date.now() - 7200_000).toISOString(),
      lastPointAt: new Date(Date.now() - 3600_000).toISOString(),
      pointCount: 100,
      batchSeq: 7,
    };
    await saveSession(pausedSession);

    renderHook(() => useGPS());

    await waitFor(async () => {
      const recovered = await getSession('paused-session-456');
      expect(recovered?.state).toBe('recovered');
    });
  });

  it('leaves completed sessions untouched', async () => {
    const completedSession: RecordingSession = {
      id: 'completed-session-789',
      trackId: 'track-789',
      state: 'complete',
      startedAt: new Date(Date.now() - 7200_000).toISOString(),
      lastPointAt: new Date(Date.now() - 3600_000).toISOString(),
      pointCount: 200,
      batchSeq: 10,
    };
    await saveSession(completedSession);

    renderHook(() => useGPS());

    // Wait a bit and verify it's still complete
    await new Promise((r) => setTimeout(r, 500));
    const session = await getSession('completed-session-789');
    expect(session?.state).toBe('complete');
  });
});
