import { useEffect, useState, useRef } from "react";

interface GPSData {
  lat: number;
  lon: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

type SignalQuality = "excellent" | "good" | "fair" | "poor" | "none";

function getSignalQuality(accuracy: number): SignalQuality {
  if (accuracy <= 5) return "excellent";
  if (accuracy <= 15) return "good";
  if (accuracy <= 30) return "fair";
  if (accuracy <= 100) return "poor";
  return "none";
}

const SIGNAL_COLORS: Record<SignalQuality, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  fair: "#eab308",
  poor: "#f97316",
  none: "#ef4444",
};

function formatCoord(val: number, pos: string, neg: string): string {
  const dir = val >= 0 ? pos : neg;
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(2);
  return `${deg}\u00B0${min}'${sec}" ${dir}`;
}

export default function GPSDiagnostics() {
  const [gps, setGps] = useState<GPSData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [updateRate, setUpdateRate] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const ratesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (lastTimestampRef.current) {
          const delta = (now - lastTimestampRef.current) / 1000;
          ratesRef.current.push(delta);
          if (ratesRef.current.length > 10) ratesRef.current.shift();
          const avg =
            ratesRef.current.reduce((a, b) => a + b, 0) /
            ratesRef.current.length;
          setUpdateRate(avg);
        }
        lastTimestampRef.current = now;

        setGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          altitude: pos.coords.altitude,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
        setUpdateCount((c) => c + 1);
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      }
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  const quality = gps ? getSignalQuality(gps.accuracy) : "none";
  const qualityColor = SIGNAL_COLORS[quality];

  return (
    <div className="settings-section">
      <h3>GPS Diagnostics</h3>

      {error && <div className="gps-diag-error">{error}</div>}

      <div className="gps-diag-signal">
        <div className="signal-bars">
          {[1, 2, 3, 4, 5].map((bar) => {
            const level =
              quality === "excellent" ? 5
              : quality === "good" ? 4
              : quality === "fair" ? 3
              : quality === "poor" ? 2
              : 0;
            return (
              <div
                key={bar}
                className="signal-bar"
                style={{
                  height: `${bar * 6}px`,
                  background: bar <= level ? qualityColor : "#334155",
                }}
              />
            );
          })}
        </div>
        <span className="signal-label" style={{ color: qualityColor }}>
          {gps ? `${quality.toUpperCase()} (${gps.accuracy.toFixed(1)}m)` : "Acquiring..."}
        </span>
      </div>

      <div className="gps-diag-grid">
        <div className="diag-item">
          <span className="diag-label">Latitude</span>
          <span className="diag-value">
            {gps ? formatCoord(gps.lat, "N", "S") : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Longitude</span>
          <span className="diag-value">
            {gps ? formatCoord(gps.lon, "E", "W") : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Horizontal Accuracy</span>
          <span className="diag-value">
            {gps ? `\u00B1${gps.accuracy.toFixed(1)} m` : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Altitude</span>
          <span className="diag-value">
            {gps?.altitude != null
              ? `${gps.altitude.toFixed(1)} m`
              : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Altitude Accuracy</span>
          <span className="diag-value">
            {gps?.altitudeAccuracy != null
              ? `\u00B1${gps.altitudeAccuracy.toFixed(1)} m`
              : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Speed</span>
          <span className="diag-value">
            {gps?.speed != null
              ? `${(gps.speed * 3.6).toFixed(1)} km/h`
              : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Heading</span>
          <span className="diag-value">
            {gps?.heading != null
              ? `${gps.heading.toFixed(0)}\u00B0`
              : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Update Rate</span>
          <span className="diag-value">
            {updateRate != null ? `${updateRate.toFixed(1)}s avg` : "--"}
          </span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Fixes Received</span>
          <span className="diag-value">{updateCount}</span>
        </div>
        <div className="diag-item">
          <span className="diag-label">Last Fix</span>
          <span className="diag-value">
            {gps
              ? new Date(gps.timestamp).toLocaleTimeString()
              : "--"}
          </span>
        </div>
      </div>

      <p className="gps-diag-note">
        Satellite count is not available via the browser Geolocation API.
        Accuracy below 15m typically indicates 4+ satellites locked.
      </p>
    </div>
  );
}
