import { useGPS } from "../../hooks/useGPS";
import { apiClient } from "../../api/client";
import { getPointsBySession } from "../../lib/db";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

function formatSpeed(mps: number): string {
  const kph = mps * 3.6;
  return `${kph.toFixed(1)} km/h`;
}

function formatElevation(metres: number): string {
  return `${Math.round(metres)} m`;
}

export default function RecordingControls() {
  const {
    isTracking,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    error,
    session,
    liveStats,
    currentPosition,
  } = useGPS();

  const isPaused = session?.state === "paused";

  const handleStop = async () => {
    const finalSession = await stopTracking();
    if (!finalSession) return;

    // Collect all recorded points and send as a new track to the API
    try {
      const points = await getPointsBySession(finalSession.id);
      if (points.length < 2) return;

      const coordinates = points.map((p) => [p.lon, p.lat, p.ele ?? 0]);

      await apiClient.createTrack({
        name: `Recording ${new Date().toLocaleDateString()}`,
        activityType: "hike",
        description: "",
        geometry: {
          type: "LineString",
          coordinates,
        },
        stats: {
          distance: liveStats.distance,
          duration: liveStats.duration,
          elevationGain: liveStats.elevationGain,
          elevationLoss: 0,
          avgSpeed:
            liveStats.duration > 0
              ? liveStats.distance / liveStats.duration
              : 0,
          hrZones: null,
        },
      });
    } catch (err) {
      console.error("[RecordingControls] Failed to save track:", err);
    }
  };

  return (
    <div className="recording-controls">
      <h2 className="recording-title">Record Activity</h2>

      {error && <div className="recording-error">{error}</div>}

      {/* Live stats */}
      <div className="recording-stats">
        <div className="stat">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{formatDuration(liveStats.duration)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Distance</span>
          <span className="stat-value">{formatDistance(liveStats.distance)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Speed</span>
          <span className="stat-value">{formatSpeed(liveStats.speed)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Elev. Gain</span>
          <span className="stat-value">
            {formatElevation(liveStats.elevationGain)}
          </span>
        </div>
      </div>

      {currentPosition && (
        <div className="gps-info">
          <span>
            {currentPosition.lat.toFixed(5)}, {currentPosition.lon.toFixed(5)}
          </span>
          <span className="accuracy">
            Accuracy: {currentPosition.accuracy.toFixed(0)} m
          </span>
        </div>
      )}

      {session && (
        <div className="session-info">
          Points recorded: {session.pointCount}
          {isPaused && <span className="paused-badge">PAUSED</span>}
        </div>
      )}

      {/* Control buttons */}
      <div className="recording-buttons">
        {!isTracking && !isPaused && (
          <button className="rec-btn start" onClick={startTracking}>
            Start Recording
          </button>
        )}
        {isTracking && (
          <>
            <button className="rec-btn pause" onClick={pauseTracking}>
              Pause
            </button>
            <button className="rec-btn stop" onClick={handleStop}>
              Stop
            </button>
          </>
        )}
        {isPaused && (
          <>
            <button className="rec-btn resume" onClick={resumeTracking}>
              Resume
            </button>
            <button className="rec-btn stop" onClick={handleStop}>
              Stop &amp; Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
