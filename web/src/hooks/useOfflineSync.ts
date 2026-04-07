import { useEffect, useRef, useState, useCallback } from "react";
import { SyncManager } from "../lib/sync";
import { getUnsyncedPoints } from "../lib/db";

interface UseOfflineSyncReturn {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  triggerSync: () => void;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const managerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    const manager = new SyncManager(15_000);

    manager.setStatusCallback((syncing, pending) => {
      setIsSyncing(syncing);
      if (pending >= 0) setPendingCount(pending);
      if (!syncing) setLastSyncAt(new Date());
    });

    manager.start();
    managerRef.current = manager;

    // Get initial pending count
    getUnsyncedPoints(1).then((pts) => setPendingCount(pts.length));

    // Listen for online/offline transitions
    const handleOnline = () => {
      manager.flush();
    };

    const handleOffline = () => {
      setIsSyncing(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      manager.stop();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const triggerSync = useCallback(() => {
    managerRef.current?.flush();
  }, []);

  return { isSyncing, pendingCount, lastSyncAt, triggerSync };
}
