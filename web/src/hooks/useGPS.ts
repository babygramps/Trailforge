import { useEffect, useRef, useState, useCallback } from "react";
import { savePoint, saveSession, getOrphanedSessions } from "../lib/db";
import { useMapStore } from "../stores/mapStore";
import type { GPSPoint, RecordingSession } from "../types";

interface GPSPosition {
  lat: number;
  lon: number;
  ele: number | null;
  speed: number | null;
  accuracy: number;
  timestamp: number;
}

interface UseGPSReturn {
  currentPosition: GPSPosition | null;
  isTracking: boolean;
  startTracking: () => void;
  stopTracking: () => Promise<RecordingSession | null>;
  pauseTracking: () => void;
  resumeTracking: () => void;
  error: string | null;
  session: RecordingSession | null;
  liveStats: {
    duration: number;
    distance: number;
    speed: number;
    elevationGain: number;
  };
}

const ACCURACY_THRESHOLD = 20; // metres — reject anything worse
const MIN_DISTANCE = 3; // metres — ignore micro-movements (jitter)
const MAX_SPEED_MPS = 50; // m/s (~180 km/h) — reject impossible jumps
const SAVE_INTERVAL = 3_000; // ms
const EARTH_RADIUS = 6_371_000; // metres
const ELE_NOISE_THRESHOLD = 2; // metres — ignore tiny elevation changes (barometer noise)

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateId(): string {
  return crypto.randomUUID();
}

export function useGPS(): UseGPSReturn {
  const [currentPosition, setCurrentPosition] = useState<GPSPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [liveStats, setLiveStats] = useState({
    duration: 0,
    distance: 0,
    speed: 0,
    elevationGain: 0,
  });

  const watchIdRef = useRef<number | null>(null);
  const pendingPointRef = useRef<GPSPosition | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const prevPointRef = useRef<GPSPosition | null>(null);
  const totalDistanceRef = useRef(0);
  const elevationGainRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const { setRecording } = useMapStore();

  // Screen Wake Lock — keeps screen on so GPS stays active while recording.
  // Without this, mobile OSes suspend the PWA when the screen turns off.
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch {
      // Wake lock request failed (e.g. low battery) — non-fatal
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  // Re-acquire wake lock when page becomes visible again (OS releases it on tab switch)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        sessionRef.current?.state === "recording" &&
        !wakeLockRef.current
      ) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [acquireWakeLock]);

  // Check for orphaned sessions on mount
  useEffect(() => {
    (async () => {
      try {
        const orphaned = await getOrphanedSessions();
        if (orphaned.length > 0) {
          // Mark orphaned sessions as recovered
          for (const s of orphaned) {
            const updated: RecordingSession = { ...s, state: "recovered" };
            await saveSession(updated);
          }
          console.warn(
            `[useGPS] Recovered ${orphaned.length} orphaned recording session(s)`
          );
        }
      } catch (err) {
        console.error("[useGPS] Failed to check orphaned sessions:", err);
      }
    })();
  }, []);

  const saveCurrentPoint = useCallback(async () => {
    const pos = pendingPointRef.current;
    const sess = sessionRef.current;
    if (!pos || !sess || sess.state !== "recording") return;

    // ---- Spike & jitter filters ----
    const prev = prevPointRef.current;
    if (prev) {
      const d = haversineDistance(prev.lat, prev.lon, pos.lat, pos.lon);
      const dt = (pos.timestamp - prev.timestamp) / 1000; // seconds

      // Ignore micro-movements (GPS jitter while standing still)
      if (d < MIN_DISTANCE) {
        pendingPointRef.current = null;
        return;
      }

      // Reject impossible speed spikes (GPS jump then snap back)
      if (dt > 0 && d / dt > MAX_SPEED_MPS) {
        pendingPointRef.current = null;
        return;
      }
    }

    const point: GPSPoint = {
      id: generateId(),
      sessionId: sess.id,
      lat: pos.lat,
      lon: pos.lon,
      ele: pos.ele,
      speed: pos.speed,
      timestamp: new Date(pos.timestamp).toISOString(),
      accuracy: pos.accuracy,
      synced: 0,
    };

    try {
      await savePoint(point);

      // Update distance / elevation
      if (prev) {
        const d = haversineDistance(prev.lat, prev.lon, pos.lat, pos.lon);
        totalDistanceRef.current += d;

        if (
          pos.ele !== null &&
          prev.ele !== null
        ) {
          const eleDiff = pos.ele - prev.ele;
          // Only count elevation change above noise threshold
          if (eleDiff > ELE_NOISE_THRESHOLD) {
            elevationGainRef.current += eleDiff;
          }
        }
      }
      prevPointRef.current = pos;

      // Update session metadata
      const updated: RecordingSession = {
        ...sess,
        lastPointAt: point.timestamp,
        pointCount: sess.pointCount + 1,
      };
      sessionRef.current = updated;
      setSession(updated);
      await saveSession(updated);
    } catch (err) {
      console.error("[useGPS] Failed to save point:", err);
    }

    pendingPointRef.current = null;
  }, []);

  const startTracking = useCallback(() => {
    if (isTracking) return;
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser");
      return;
    }

    const newSession: RecordingSession = {
      id: generateId(),
      trackId: generateId(),
      state: "recording",
      startedAt: new Date().toISOString(),
      lastPointAt: null,
      pointCount: 0,
      batchSeq: 0,
    };

    sessionRef.current = newSession;
    setSession(newSession);
    setRecording(true, newSession);
    totalDistanceRef.current = 0;
    elevationGainRef.current = 0;
    prevPointRef.current = null;

    saveSession(newSession);
    acquireWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GPSPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude,
          ele: geo.coords.altitude,
          speed: geo.coords.speed,
          accuracy: geo.coords.accuracy,
          timestamp: geo.timestamp,
        };
        setCurrentPosition(pos);

        // Filter low-accuracy points
        if (pos.accuracy <= ACCURACY_THRESHOLD) {
          pendingPointRef.current = pos;
        }
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10_000,
      }
    );

    // Save pending points every 5 seconds
    saveTimerRef.current = setInterval(saveCurrentPoint, SAVE_INTERVAL);

    // Update live stats every second
    statsTimerRef.current = setInterval(() => {
      const sess = sessionRef.current;
      if (!sess) return;

      const elapsed = (Date.now() - new Date(sess.startedAt).getTime()) / 1000;
      setLiveStats({
        duration: elapsed,
        distance: totalDistanceRef.current,
        speed: pendingPointRef.current?.speed ?? 0,
        elevationGain: elevationGainRef.current,
      });
    }, 1_000);

    setIsTracking(true);
  }, [isTracking, saveCurrentPoint, setRecording, acquireWakeLock]);

  const pauseTracking = useCallback(() => {
    if (!sessionRef.current) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }

    const updated: RecordingSession = {
      ...sessionRef.current,
      state: "paused",
    };
    sessionRef.current = updated;
    setSession(updated);
    setRecording(true, updated);
    saveSession(updated);
    releaseWakeLock();
    setIsTracking(false);
  }, [setRecording, releaseWakeLock]);

  const resumeTracking = useCallback(() => {
    if (!sessionRef.current || sessionRef.current.state !== "paused") return;

    const updated: RecordingSession = {
      ...sessionRef.current,
      state: "recording",
    };
    sessionRef.current = updated;
    setSession(updated);
    acquireWakeLock();
    setRecording(true, updated);
    saveSession(updated);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GPSPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude,
          ele: geo.coords.altitude,
          speed: geo.coords.speed,
          accuracy: geo.coords.accuracy,
          timestamp: geo.timestamp,
        };
        setCurrentPosition(pos);
        if (pos.accuracy <= ACCURACY_THRESHOLD) {
          pendingPointRef.current = pos;
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10_000 }
    );

    saveTimerRef.current = setInterval(saveCurrentPoint, SAVE_INTERVAL);
    statsTimerRef.current = setInterval(() => {
      const sess = sessionRef.current;
      if (!sess) return;
      const elapsed = (Date.now() - new Date(sess.startedAt).getTime()) / 1000;
      setLiveStats({
        duration: elapsed,
        distance: totalDistanceRef.current,
        speed: pendingPointRef.current?.speed ?? 0,
        elevationGain: elevationGainRef.current,
      });
    }, 1_000);

    setIsTracking(true);
  }, [saveCurrentPoint, setRecording, acquireWakeLock]);

  const stopTracking = useCallback(async (): Promise<RecordingSession | null> => {
    // Flush any remaining point
    await saveCurrentPoint();

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }

    let finalSession: RecordingSession | null = null;

    if (sessionRef.current) {
      finalSession = {
        ...sessionRef.current,
        state: "complete",
      };
      sessionRef.current = null;
      await saveSession(finalSession);
    }

    setSession(null);
    setIsTracking(false);
    setRecording(false, null);
    releaseWakeLock();
    totalDistanceRef.current = 0;
    elevationGainRef.current = 0;
    prevPointRef.current = null;
    pendingPointRef.current = null;

    return finalSession;
  }, [saveCurrentPoint, setRecording, releaseWakeLock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
      wakeLockRef.current?.release();
    };
  }, []);

  return {
    currentPosition,
    isTracking,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    error,
    session,
    liveStats,
  };
}
