import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getPointsBySession } from '../lib/db';

// Mock navigator.geolocation
let watchCallback: ((pos: GeolocationPosition) => void) | null = null;
const mockWatchPosition = vi.fn((success: PositionCallback) => {
  watchCallback = success;
  return 1;
});
const mockClearWatch = vi.fn();

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

beforeEach(() => {
  uuidCounter = 0;
  watchCallback = null;
  mockWatchPosition.mockClear();
  mockClearWatch.mockClear();

  Object.defineProperty(navigator, 'geolocation', {
    value: {
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
    },
    writable: true,
    configurable: true,
  });
});

const { useGPS } = await import('../hooks/useGPS');

function createGeolocationPosition(
  lat: number,
  lon: number,
  alt: number,
  accuracy: number,
  speed: number,
): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      altitude: alt,
      accuracy,
      speed,
      altitudeAccuracy: 10,
      heading: 0,
    },
    timestamp: Date.now(),
  };
}

describe('Recording Flow Integration', () => {
  it('full recording lifecycle: start → points → pause → resume → stop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useGPS());

    // Initially not tracking
    expect(result.current.isTracking).toBe(false);
    expect(result.current.session).toBeNull();

    // Start recording
    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(true);
    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.state).toBe('recording');

    const sessionId = result.current.session!.id;

    // Simulate GPS positions (accuracy < 30m threshold)
    act(() => {
      watchCallback?.(createGeolocationPosition(37.7567, -119.5966, 1209, 10, 1.2));
    });

    // Advance 5s to trigger save interval
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Simulate second position
    act(() => {
      watchCallback?.(createGeolocationPosition(37.7571, -119.5958, 1215, 8, 1.1));
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Should have accumulated stats
    expect(result.current.liveStats.distance).toBeGreaterThan(0);
    expect(result.current.session?.pointCount).toBeGreaterThanOrEqual(1);

    // Pause
    act(() => {
      result.current.pauseTracking();
    });
    expect(result.current.isTracking).toBe(false);
    expect(result.current.session?.state).toBe('paused');

    // Resume
    act(() => {
      result.current.resumeTracking();
    });
    expect(result.current.isTracking).toBe(true);
    expect(result.current.session?.state).toBe('recording');

    // Stop
    let finalSession: unknown;
    await act(async () => {
      finalSession = await result.current.stopTracking();
    });

    expect(result.current.isTracking).toBe(false);
    expect(result.current.session).toBeNull();
    expect((finalSession as { state: string })?.state).toBe('complete');

    vi.useRealTimers();
  });

  it('rejects low-accuracy GPS points', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useGPS());

    act(() => {
      result.current.startTracking();
    });

    // Send low accuracy point (> 30m threshold)
    act(() => {
      watchCallback?.(createGeolocationPosition(37.7567, -119.5966, 1209, 50, 1.2));
    });

    // Advance past save interval
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Point count should still be 0 — low accuracy was filtered
    expect(result.current.session?.pointCount).toBe(0);

    // Now send a good accuracy point
    act(() => {
      watchCallback?.(createGeolocationPosition(37.7567, -119.5966, 1209, 10, 1.2));
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.session?.pointCount).toBe(1);

    await act(async () => {
      await result.current.stopTracking();
    });

    vi.useRealTimers();
  });
});
