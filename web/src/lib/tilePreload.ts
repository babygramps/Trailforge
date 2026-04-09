/**
 * Background tile pre-seeder.
 *
 * After obtaining the user's location, proactively fetches OSM tiles for the
 * surrounding area at useful zoom levels so they're available in the SW cache
 * for offline use.
 */

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Zoom levels to pre-seed (good range for hiking / city navigation)
const SEED_ZOOMS = [12, 13, 14, 15];

// How many tiles outward from center at each zoom (1 = 3×3, 2 = 5×5)
const RADIUS = 2;

// Max concurrent fetches to avoid saturating the connection
const CONCURRENCY = 4;

/** Convert lng/lat to tile x/y at a given zoom. */
function lngLatToTile(
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

/**
 * Pre-seed tiles around a location.  Fetches happen via normal `fetch()`,
 * which the service worker intercepts and caches automatically.
 */
export async function preseedTiles(lng: number, lat: number): Promise<void> {
  const urls: string[] = [];

  for (const z of SEED_ZOOMS) {
    const center = lngLatToTile(lng, lat, z);
    const maxTile = (1 << z) - 1;

    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const tx = center.x + dx;
        const ty = center.y + dy;
        if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;

        urls.push(
          TILE_URL.replace("{z}", String(z))
            .replace("{x}", String(tx))
            .replace("{y}", String(ty))
        );
      }
    }
  }

  // Fetch in small batches to be polite to the tile server
  let i = 0;
  while (i < urls.length) {
    const batch = urls.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map((url) => fetch(url, { mode: "cors", credentials: "omit" }))
    );
    i += CONCURRENCY;
  }
}
