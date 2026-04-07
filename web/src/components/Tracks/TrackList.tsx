import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { useMapStore } from "../../stores/mapStore";
import type { Track } from "../../types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const ACTIVITY_ICONS: Record<string, string> = {
  bike: "🚴",
  hike: "🥾",
  paddle: "🛶",
};

export default function TrackList() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setSelectedTrack } = useMapStore();

  useEffect(() => {
    loadTracks();
  }, []);

  async function loadTracks() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getTracks();
      setTracks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracks");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(trackId: string) {
    if (!window.confirm("Delete this track?")) return;
    try {
      await apiClient.deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (err) {
      console.error("Failed to delete track:", err);
    }
  }

  async function handleExport(trackId: string, name: string) {
    try {
      const blob = await apiClient.exportGPX(trackId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.gpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export GPX:", err);
    }
  }

  function handleViewOnMap(trackId: string) {
    setSelectedTrack(trackId);
    // Navigate to map view - in real app would use router
    window.location.hash = "#/";
  }

  if (loading) {
    return (
      <div className="track-list">
        <h2>My Tracks</h2>
        <div className="loading">Loading tracks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="track-list">
        <h2>My Tracks</h2>
        <div className="error-message">{error}</div>
        <button onClick={loadTracks} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="track-list">
      <h2>My Tracks</h2>
      {tracks.length === 0 ? (
        <p className="empty-state">
          No tracks yet. Go record your first adventure!
        </p>
      ) : (
        <ul className="tracks">
          {tracks.map((track) => (
            <li key={track.id} className="track-item">
              <div
                className="track-info"
                onClick={() => handleViewOnMap(track.id)}
              >
                <div className="track-header">
                  <span className="activity-icon">
                    {ACTIVITY_ICONS[track.activityType] ?? "📍"}
                  </span>
                  <span className="track-name">{track.name}</span>
                </div>
                <div className="track-meta">
                  <span className="track-date">
                    {formatDate(track.createdAt)}
                  </span>
                  <span className="track-distance">
                    {formatDistance(track.stats.distance)}
                  </span>
                  <span className="track-duration">
                    {formatDuration(track.stats.duration)}
                  </span>
                </div>
              </div>
              <div className="track-actions">
                <button
                  className="action-btn export"
                  onClick={() => handleExport(track.id, track.name)}
                  title="Export GPX"
                >
                  GPX
                </button>
                <button
                  className="action-btn delete"
                  onClick={() => handleDelete(track.id)}
                  title="Delete"
                >
                  Del
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
