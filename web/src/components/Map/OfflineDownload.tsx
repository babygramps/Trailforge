import { useState, useRef, useCallback, useMemo } from "react";
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

const MIN_ZOOM = 6;
const MAX_ZOOM = 17;
const AVG_TILE_KB = 20; // average tile size estimate in KB

type Stage = "idle" | "confirm" | "downloading" | "done" | "error";

function formatSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function OfflineDownload() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [regionName, setRegionName] = useState("");
  const [zoomMin, setZoomMin] = useState(10);
  const [zoomMax, setZoomMax] = useState(15);
  const [bounds, setBounds] = useState<{ w: number; s: number; e: number; n: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mapInstance = useMapStore((s) => s.mapInstance);
  const layers = useMapStore((s) => s.layers);

  const activeBaseLayer =
    layers.find(
      (l) =>
        l.visible && l.type === "raster" && TILE_TEMPLATES[l.id] !== undefined
    ) ?? layers[0];

  const zooms = useMemo(() => {
    const arr: number[] = [];
    for (let z = zoomMin; z <= zoomMax; z++) arr.push(z);
    return arr;
  }, [zoomMin, zoomMax]);

  const tileCount = useMemo(() => {
    if (!bounds) return 0;
    return countTilesForBounds(bounds.w, bounds.s, bounds.e, bounds.n, zooms);
  }, [bounds, zooms]);

  const estimatedSize = useMemo(() => tileCount * AVG_TILE_KB, [tileCount]);

  const handleOpen = useCallback(() => {
    if (!mapInstance) return;
    const b = mapInstance.getBounds();
    setBounds({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() });
    setRegionName("");
    setZoomMin(10);
    setZoomMax(15);
    setStage("confirm");
  }, [mapInstance]);

  const handleDownload = useCallback(async () => {
    if (!mapInstance || !bounds) return;

    const template =
      TILE_TEMPLATES[activeBaseLayer.id] ?? TILE_TEMPLATES["osm"];

    const urls = tileUrlsForBounds(
      bounds.w, bounds.s, bounds.e, bounds.n,
      zooms,
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
        bounds: { west: bounds.w, south: bounds.s, east: bounds.e, north: bounds.n },
        zooms,
        layerId: activeBaseLayer.id,
        tileCount: final.done - final.failed,
        savedAt: new Date().toISOString(),
      };
      saveRegion(region);
      setStage("done");
    } catch {
      if (!ac.signal.aborted) setStage("error");
    }
  }, [mapInstance, bounds, activeBaseLayer, regionName, zooms]);

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

          <div className="offline-zoom-controls">
            <label className="offline-zoom-label">
              <span>Min zoom</span>
              <div className="offline-zoom-row">
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={zoomMax}
                  value={zoomMin}
                  onChange={(e) => setZoomMin(Number(e.target.value))}
                  className="offline-zoom-slider"
                />
                <span className="offline-zoom-value">{zoomMin}</span>
              </div>
            </label>
            <label className="offline-zoom-label">
              <span>Max zoom</span>
              <div className="offline-zoom-row">
                <input
                  type="range"
                  min={zoomMin}
                  max={MAX_ZOOM}
                  value={zoomMax}
                  onChange={(e) => setZoomMax(Number(e.target.value))}
                  className="offline-zoom-slider"
                />
                <span className="offline-zoom-value">{zoomMax}</span>
              </div>
            </label>
          </div>

          <div className="offline-toast-info">
            ~{tileCount.toLocaleString()} tiles &middot; est.{" "}
            {formatSize(estimatedSize)} &middot; {activeBaseLayer.name}
          </div>

          {tileCount > 50_000 && (
            <div className="offline-toast-warn">
              Large download — consider reducing zoom range or area
            </div>
          )}

          <div className="offline-toast-actions">
            <button className="offline-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="offline-btn download"
              onClick={handleDownload}
              disabled={tileCount === 0}
            >
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
            {" "}&middot; est. {formatSize((progress?.done ?? 0) * AVG_TILE_KB)} /{" "}
            {formatSize((progress?.total ?? 0) * AVG_TILE_KB)}
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
            {(progress?.done ?? 0) - (progress?.failed ?? 0)} tiles cached
            (~{formatSize(((progress?.done ?? 0) - (progress?.failed ?? 0)) * AVG_TILE_KB)}).
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
