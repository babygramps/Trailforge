import { getUnsyncedPoints, markPointsSynced } from "./db";
import { apiClient } from "../api/client";
import type { GPSPoint } from "../types";

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export class SyncManager {
  private syncing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private intervalMs: number;
  private onStatusChange: ((syncing: boolean, pending: number) => void) | null =
    null;

  constructor(intervalMs = 15_000) {
    this.intervalMs = intervalMs;
  }

  setStatusCallback(
    cb: (syncing: boolean, pending: number) => void
  ): void {
    this.onStatusChange = cb;
  }

  start(): void {
    this.scheduleNext();
    window.addEventListener("online", this.handleOnline);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    window.removeEventListener("online", this.handleOnline);
  }

  private handleOnline = (): void => {
    // Immediately attempt a sync when connectivity is restored
    this.flush();
  };

  private scheduleNext(): void {
    this.timer = setTimeout(async () => {
      await this.flush();
      this.scheduleNext();
    }, this.intervalMs);
  }

  async flush(): Promise<void> {
    if (this.syncing || !navigator.onLine) return;

    this.syncing = true;
    this.onStatusChange?.(true, -1);

    try {
      let points = await getUnsyncedPoints(BATCH_SIZE);

      while (points.length > 0) {
        const grouped = groupBySession(points);

        for (const [sessionId, sessionPoints] of Object.entries(grouped)) {
          const batchSeq = deriveBatchSeq(sessionPoints);
          const idempotencyKey = `${sessionId}-batch-${batchSeq}`;

          await this.sendBatchWithRetry(
            sessionId,
            sessionPoints,
            idempotencyKey
          );

          // Delete by specific IDs after successful sync
          const ids = sessionPoints.map((p) => p.id);
          await markPointsSynced(ids);
        }

        points = await getUnsyncedPoints(BATCH_SIZE);
      }
    } catch (err) {
      console.error("[SyncManager] flush error:", err);
    } finally {
      this.syncing = false;
      const remaining = await getUnsyncedPoints(1);
      this.onStatusChange?.(false, remaining.length);
    }
  }

  private async sendBatchWithRetry(
    sessionId: string,
    points: GPSPoint[],
    idempotencyKey: string
  ): Promise<void> {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        await apiClient.appendPoints(sessionId, points, idempotencyKey);
        return;
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES) throw err;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * delay * 0.3;
        await sleep(delay + jitter);
      }
    }
  }
}

function groupBySession(
  points: GPSPoint[]
): Record<string, GPSPoint[]> {
  const groups: Record<string, GPSPoint[]> = {};
  for (const p of points) {
    if (!groups[p.sessionId]) groups[p.sessionId] = [];
    groups[p.sessionId].push(p);
  }
  return groups;
}

function deriveBatchSeq(points: GPSPoint[]): number {
  // Use the earliest timestamp in the batch to derive a deterministic seq number
  const earliest = points.reduce(
    (min, p) => (p.timestamp < min ? p.timestamp : min),
    points[0].timestamp
  );
  return Math.floor(new Date(earliest).getTime() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
