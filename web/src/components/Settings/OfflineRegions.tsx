import { useState, useEffect, useCallback } from "react";
import {
  getSavedRegions,
  deleteRegion,
  type OfflineRegion,
} from "../../lib/tilePreload";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OfflineRegions() {
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<string | null>(null);

  useEffect(() => {
    setRegions(getSavedRegions());

    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est.usage !== undefined) {
          const mb = (est.usage / (1024 * 1024)).toFixed(1);
          setStorageEstimate(`${mb} MB used`);
        }
      });
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteRegion(id);
    setRegions(getSavedRegions());
  }, []);

  return (
    <div className="settings-section">
      <h3>Offline Maps</h3>
      <p className="offline-hint">
        Save areas from the map using the download button. Tiles are cached in
        your browser for offline use.
      </p>
      {storageEstimate && (
        <p className="offline-storage">{storageEstimate}</p>
      )}
      {regions.length === 0 ? (
        <p className="settings-placeholder">No saved regions yet.</p>
      ) : (
        <div className="offline-regions">
          {regions.map((r) => (
            <div key={r.id} className="offline-region-item">
              <div className="offline-region-info">
                <span className="offline-region-name">{r.name}</span>
                <span className="offline-region-meta">
                  {r.tileCount.toLocaleString()} tiles &middot;{" "}
                  {formatDate(r.savedAt)}
                </span>
              </div>
              <button
                className="offline-region-delete"
                onClick={() => handleDelete(r.id)}
                aria-label={`Delete ${r.name}`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
