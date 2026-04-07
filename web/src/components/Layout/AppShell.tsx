import { NavLink, Outlet } from "react-router-dom";
import { useOfflineSync } from "../../hooks/useOfflineSync";

export default function AppShell() {
  const { isSyncing, pendingCount } = useOfflineSync();

  return (
    <div className="app-shell">
      {/* Status bar */}
      {(isSyncing || pendingCount > 0) && (
        <div className="sync-bar">
          {isSyncing
            ? "Syncing..."
            : `${pendingCount} point${pendingCount !== 1 ? "s" : ""} pending sync`}
        </div>
      )}

      {!navigator.onLine && (
        <div className="offline-bar">Offline mode</div>
      )}

      {/* Main content */}
      <main className="app-main">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <NavLink to="/" end className={navLinkClass}>
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </span>
          <span className="nav-label">Map</span>
        </NavLink>

        <NavLink to="/tracks" className={navLinkClass}>
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
            </svg>
          </span>
          <span className="nav-label">Tracks</span>
        </NavLink>

        <NavLink to="/record" className={navLinkClass}>
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </span>
          <span className="nav-label">Record</span>
        </NavLink>

        <NavLink to="/settings" className={navLinkClass}>
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </span>
          <span className="nav-label">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}

function navLinkClass({
  isActive,
}: {
  isActive: boolean;
}): string {
  return `nav-item ${isActive ? "active" : ""}`;
}
