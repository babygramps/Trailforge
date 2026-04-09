/**
 * Tile pre-loading and offline area download utilities.
 *
 * Tiles are fetched via normal fetch() — the service worker intercepts
 * and caches them automatically (cache-first strategy).
 */

// ---- Tile URL templates keyed by layer ID ----
export const TILE_TEMPLATES: Record<string, string> = {
  "topo-base": "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  cyclosm: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  "waymarked-hiking": "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
  "waymarked-cycling":
    "https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png",
};

const CONCURRENCY = 6;

// ---- Coordinate math ----

/** Convert lng/lat to tile x/y at a given zoom. */
export function lngLatToTile(
  lng: number,
  lat: number,
  z: number
): { x: number; y: number } {
  const x = Math.floor(((lng + 180) / 360) * (1 << z));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      (1 << z)
  );
  return { x, y };
}

/** Build the list of tile URLs for a bounding box at given zoom levels. */
export function tileUrlsForBounds(
  west: number,
  south: number,
  east: number,
  north: number,
  zooms: number[],
  templateUrl: string
): string[] {
  const urls: string[] = [];

  for (const z of zooms) {
    const topLeft = lngLatToTile(west, north, z);
    const bottomRight = lngLatToTile(east, south, z);
    const maxTile = (1 << z) - 1;

    const xMin = Math.max(0, topLeft.x);
    const xMax = Math.min(maxTile, bottomRight.x);
    const yMin = Math.max(0, topLeft.y);
    const yMax = Math.min(maxTile, bottomRight.y);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(
          templateUrl
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y))
        );
      }
    }
  }

  return urls;
}

/** Count tiles for a bounding box at given zoom levels (no fetch). */
export function countTilesForBounds(
  west: number,
  south: number,
  east: number,
  north: number,
  zooms: number[]
): number {
  let total = 0;
  for (const z of zooms) {
    const topLeft = lngLatToTile(west, north, z);
    const bottomRight = lngLatToTile(east, south, z);
    const maxTile = (1 << z) - 1;
    const w = Math.min(maxTile, bottomRight.x) - Math.max(0, topLeft.x) + 1;
    const h = Math.min(maxTile, bottomRight.y) - Math.max(0, topLeft.y) + 1;
    total += Math.max(0, w) * Math.max(0, h);
  }
  return total;
}

// ---- Download with progress ----

export interface DownloadProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Download tiles for an area.
 * @param abort  AbortController signal to cancel the download.
 * @param onProgress  Called after each batch completes.
 * @returns Final progress.
 */
export async function downloadTiles(
  urls: string[],
  abort?: AbortSignal,
  onProgress?: (p: DownloadProgress) => void
): Promise<DownloadProgress> {
  const progress: DownloadProgress = {
    done: 0,
    total: urls.length,
    failed: 0,
  };

  let i = 0;
  while (i < urls.length) {
    if (abort?.aborted) break;

    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((url) =>
        fetch(url, { mode: "cors", credentials: "omit", signal: abort })
      )
    );

    for (const r of results) {
      progress.done++;
      if (r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)) {
        progress.failed++;
      }
    }
    onProgress?.(progress);
    i += CONCURRENCY;
  }

  return progress;
}

// ---- Background pre-seed (lightweight, around a point) ----

const SEED_ZOOMS = [12, 13, 14, 15];
const SEED_RADIUS = 2;

export async function preseedTiles(lng: number, lat: number): Promise<void> {
  const urls: string[] = [];
  const template = TILE_TEMPLATES["osm"];

  for (const z of SEED_ZOOMS) {
    const center = lngLatToTile(lng, lat, z);
    const maxTile = (1 << z) - 1;

    for (let dx = -SEED_RADIUS; dx <= SEED_RADIUS; dx++) {
      for (let dy = -SEED_RADIUS; dy <= SEED_RADIUS; dy++) {
        const tx = center.x + dx;
        const ty = center.y + dy;
        if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;
        urls.push(
          template
            .replace("{z}", String(z))
            .replace("{x}", String(tx))
            .replace("{y}", String(ty))
        );
      }
    }
  }

  await downloadTiles(urls);
}

// ---- Saved regions (metadata in localStorage) ----

const REGIONS_KEY = "tf_offline_regions";

export interface OfflineRegion {
  id: string;
  name: string;
  bounds: { west: number; south: number; east: number; north: number };
  zooms: number[];
  layerId: string;
  tileCount: number;
  savedAt: string; // ISO
}

export function getSavedRegions(): OfflineRegion[] {
  try {
    const raw = localStorage.getItem(REGIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRegion(region: OfflineRegion): void {
  const regions = getSavedRegions();
  regions.push(region);
  localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
}

export function deleteRegion(id: string): void {
  const regions = getSavedRegions().filter((r) => r.id !== id);
  localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
}
