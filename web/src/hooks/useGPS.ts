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

const ACCURACY_THRESHOLD = 30; // metres
const SAVE_INTERVAL = 5_000; // ms
const EARTH_RADIUS = 6_371_000; // metres

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

  const { setRecording } = useMapStore();

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
      if (prevPointRef.current) {
        const d = haversineDistance(
          prevPointRef.current.lat,
          prevPointRef.current.lon,
          pos.lat,
          pos.lon
        );
        totalDistanceRef.current += d;

        if (
          pos.ele !== null &&
          prevPointRef.current.ele !== null &&
          pos.ele > prevPointRef.current.ele
        ) {
          elevationGainRef.current += pos.ele - prevPointRef.current.ele;
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
  }, [isTracking, saveCurrentPoint, setRecording]);

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
    setIsTracking(false);
  }, [setRecording]);

  const resumeTracking = useCallback(() => {
    if (!sessionRef.current || sessionRef.current.state !== "paused") return;

    const updated: RecordingSession = {
      ...sessionRef.current,
      state: "recording",
    };
    sessionRef.current = updated;
    setSession(updated);
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
  }, [saveCurrentPoint, setRecording]);

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
    totalDistanceRef.current = 0;
    elevationGainRef.current = 0;
    prevPointRef.current = null;
    pendingPointRef.current = null;

    return finalSession;
  }, [saveCurrentPoint, setRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
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
