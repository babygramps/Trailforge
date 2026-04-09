import { useState, useRef, useCallback } from "react";
import { useMapStore } from "../../stores/mapStore";
import {
  TILE_TEMPLATES,
  tileUrlsForBounds,
  countTilesForBounds,
  downloadTiles,
  saveRegion,
  type DownloadProgress,
  type OfflineRegion,
} from "../../lib/tilePreload";

const DOWNLOAD_ZOOMS = [10, 11, 12, 13, 14, 15];

type Stage = "idle" | "confirm" | "downloading" | "done" | "error";

export default function OfflineDownload() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [tileCount, setTileCount] = useState(0);
  const [regionName, setRegionName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const mapInstance = useMapStore((s) => s.mapInstance);
  const layers = useMapStore((s) => s.layers);

  const activeBaseLayer =
    layers.find(
      (l) =>
        l.visible && l.type === "raster" && TILE_TEMPLATES[l.id] !== undefined
    ) ?? layers[0];

  const handleOpen = useCallback(() => {
    if (!mapInstance) return;
    const bounds = mapInstance.getBounds();
    const count = countTilesForBounds(
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
      DOWNLOAD_ZOOMS
    );
    setTileCount(count);
    setRegionName("");
    setStage("confirm");
  }, [mapInstance]);

  const handleDownload = useCallback(async () => {
    if (!mapInstance) return;

    const bounds = mapInstance.getBounds();
    const template =
      TILE_TEMPLATES[activeBaseLayer.id] ?? TILE_TEMPLATES["osm"];

    const urls = tileUrlsForBounds(
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
      DOWNLOAD_ZOOMS,
      template
    );

    const ac = new AbortController();
    abortRef.current = ac;
    setStage("downloading");
    setProgress({ done: 0, total: urls.length, failed: 0 });

    // Request persistent storage so the browser doesn't evict our tiles
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }

    try {
      const final = await downloadTiles(urls, ac.signal, (p) =>
        setProgress({ ...p })
      );

      // Save region metadata
      const region: OfflineRegion = {
        id: crypto.randomUUID(),
        name: regionName || "Unnamed area",
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        zooms: DOWNLOAD_ZOOMS,
        layerId: activeBaseLayer.id,
        tileCount: final.done - final.failed,
        savedAt: new Date().toISOString(),
      };
      saveRegion(region);
      setStage("done");
    } catch {
      if (!ac.signal.aborted) setStage("error");
    }
  }, [mapInstance, activeBaseLayer, regionName]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStage("idle");
    setProgress(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setStage("idle");
    setProgress(null);
  }, []);

  if (stage === "idle") {
    return (
      <button
        className="offline-download-btn"
        onClick={handleOpen}
        aria-label="Save area for offline"
        title="Save area for offline"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    );
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="offline-toast">
      {stage === "confirm" && (
        <>
          <div className="offline-toast-title">Save area for offline?</div>
          <input
            className="offline-toast-name"
            placeholder="Region name (optional)"
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
          />
          <div className="offline-toast-info">
            ~{tileCount.toLocaleString()} tiles from {activeBaseLayer.name} at
            zoom 10–15
          </div>
          <div className="offline-toast-actions">
            <button className="offline-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button className="offline-btn download" onClick={handleDownload}>
              Download
            </button>
          </div>
        </>
      )}

      {stage === "downloading" && (
        <>
          <div className="offline-toast-title">Downloading tiles...</div>
          <div className="offline-progress-bar">
            <div className="offline-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="offline-toast-info">
            {progress?.done.toLocaleString()} / {progress?.total.toLocaleString()}
            {progress && progress.failed > 0 && (
              <span className="offline-failed">
                {" "}({progress.failed} failed)
              </span>
            )}
          </div>
          <button className="offline-btn cancel" onClick={handleCancel}>
            Cancel
          </button>
        </>
      )}

      {stage === "done" && (
        <>
          <div className="offline-toast-title">Area saved!</div>
          <div className="offline-toast-info">
            {(progress?.done ?? 0) - (progress?.failed ?? 0)} tiles cached.
            Manage in Settings.
          </div>
          <button className="offline-btn download" onClick={handleDismiss}>
            Done
          </button>
        </>
      )}

      {stage === "error" && (
        <>
          <div className="offline-toast-title">Download failed</div>
          <div className="offline-toast-info">
            Check your connection and try again.
          </div>
          <button className="offline-btn cancel" onClick={handleDismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
