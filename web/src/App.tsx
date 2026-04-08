import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/Layout/AppShell";
import MapView from "./components/Map/MapView";
import TrackList from "./components/Tracks/TrackList";
import RecordingControls from "./components/Recording/RecordingControls";
import LayerManager from "./components/Map/LayerManager";
import LayerPresets from "./components/Map/LayerPresets";
import GPSDiagnostics from "./components/Settings/GPSDiagnostics";
import "./App.css";

function MapPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="map-page">
      <MapView />
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
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <GPSDiagnostics />
      <div className="settings-section">
        <h3>Account</h3>
        <p className="settings-placeholder">
          Account management coming soon.
        </p>
      </div>
      <div className="settings-section">
        <h3>Offline Maps</h3>
        <p className="settings-placeholder">
          Download map regions for offline use.
        </p>
      </div>
      <div className="settings-section">
        <h3>About</h3>
        <p>TrailForge v0.1.0</p>
        <p>Self-hosted adventure GPS</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<MapPage />} />
          <Route path="/tracks" element={<TrackList />} />
          <Route path="/record" element={<RecordingControls />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
