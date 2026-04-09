import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/Layout/AppShell";
import AuthScreen from "./components/Auth/AuthScreen";
import MapView from "./components/Map/MapView";
import TrackList from "./components/Tracks/TrackList";
import RecordingControls from "./components/Recording/RecordingControls";
import LayerManager from "./components/Map/LayerManager";
import LayerPresets from "./components/Map/LayerPresets";
import MapSearch from "./components/Map/MapSearch";
import SaveWaypointModal from "./components/Map/SaveWaypointModal";
import OfflineDownload from "./components/Map/OfflineDownload";
import GPSDiagnostics from "./components/Settings/GPSDiagnostics";
import OfflineRegions from "./components/Settings/OfflineRegions";
import { useAuthStore } from "./stores/authStore";
import "./App.css";

function MapPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="map-page">
      <MapView />
      <MapSearch />
      <button
        className="layers-toggle-btn"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label={sidebarOpen ? "Close layers" : "Open layers"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>
      <div className={`map-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Layers</span>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close layers"
          >
            ×
          </button>
        </div>
        <LayerPresets />
        <LayerManager />
      </div>
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <OfflineDownload />
      <SaveWaypointModal />
    </div>
  );
}

function AuthRequiredPage({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="auth-required-page">
        <AuthScreen />
      </div>
    );
  }

  return <>{children}</>;
}

function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <div className="settings-section">
        <h3>Account</h3>
        {user ? (
          <div className="account-info">
            <div className="account-avatar">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="account-details">
              <span className="account-name">{user.displayName}</span>
              <span className="account-email">{user.email}</span>
            </div>
            <button className="logout-btn" onClick={logout}>
              Sign Out
            </button>
          </div>
        ) : (
          <AuthScreen />
        )}
      </div>

      <GPSDiagnostics />

      <OfflineRegions />
      <div className="settings-section">
        <h3>About</h3>
        <p>TrailForge v0.1.0</p>
        <p>Self-hosted adventure GPS</p>
      </div>
    </div>
  );
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<MapPage />} />
          <Route path="/tracks" element={<AuthRequiredPage><TrackList /></AuthRequiredPage>} />
          <Route path="/record" element={<AuthRequiredPage><RecordingControls /></AuthRequiredPage>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
