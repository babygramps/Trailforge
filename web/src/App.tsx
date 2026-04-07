import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/Layout/AppShell";
import MapView from "./components/Map/MapView";
import TrackList from "./components/Tracks/TrackList";
import RecordingControls from "./components/Recording/RecordingControls";
import LayerManager from "./components/Map/LayerManager";
import LayerPresets from "./components/Map/LayerPresets";
import "./App.css";

function MapPage() {
  return (
    <div className="map-page">
      <MapView />
      <div className="map-sidebar" id="map-sidebar">
        <LayerPresets />
        <LayerManager />
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="settings-page">
      <h2>Settings</h2>
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
