import { useState, useEffect } from "react";
import { useMapStore } from "../../stores/mapStore";
import { saveLayerPreset, getLayerPresets } from "../../lib/db";
import type { LayerPreset } from "../../types";

const BUILTIN_PRESETS: LayerPreset[] = [
  {
    id: "preset-topo",
    name: "Topo",
    layers: {
      "topo-base": { visible: true, opacity: 1 },
      satellite: { visible: false, opacity: 1 },
      hillshade: { visible: true, opacity: 0.3 },
      contours: { visible: true, opacity: 0.6 },
      "public-land": { visible: false, opacity: 0.4 },
      trails: { visible: true, opacity: 0.8 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: true, opacity: 1 },
    },
  },
  {
    id: "preset-satellite-topo",
    name: "Satellite+Topo",
    layers: {
      "topo-base": { visible: false, opacity: 1 },
      satellite: { visible: true, opacity: 1 },
      hillshade: { visible: false, opacity: 0.3 },
      contours: { visible: true, opacity: 0.5 },
      "public-land": { visible: false, opacity: 0.4 },
      trails: { visible: true, opacity: 0.9 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: true, opacity: 1 },
    },
  },
  {
    id: "preset-public-land",
    name: "Public Land",
    layers: {
      "topo-base": { visible: true, opacity: 0.7 },
      satellite: { visible: false, opacity: 1 },
      hillshade: { visible: true, opacity: 0.3 },
      contours: { visible: false, opacity: 0.6 },
      "public-land": { visible: true, opacity: 0.5 },
      trails: { visible: true, opacity: 0.8 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: true, opacity: 1 },
    },
  },
  {
    id: "preset-minimal",
    name: "Minimal",
    layers: {
      "topo-base": { visible: true, opacity: 1 },
      satellite: { visible: false, opacity: 1 },
      hillshade: { visible: false, opacity: 0.3 },
      contours: { visible: false, opacity: 0.6 },
      "public-land": { visible: false, opacity: 0.4 },
      trails: { visible: false, opacity: 0.8 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: true, opacity: 1 },
    },
  },
];

export default function LayerPresets() {
  const { layers, activePreset, applyPreset } = useMapStore();
  const [customPresets, setCustomPresets] = useState<LayerPreset[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    getLayerPresets().then(setCustomPresets);
  }, []);

  const handleSave = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) return;

    const layerConfig: Record<string, { visible: boolean; opacity: number }> =
      {};
    for (const l of layers) {
      layerConfig[l.id] = { visible: l.visible, opacity: l.opacity };
    }

    const preset: LayerPreset = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      layers: layerConfig,
    };

    await saveLayerPreset(preset);
    setCustomPresets((prev) => [...prev, preset]);
    setSaveName("");
    setShowSave(false);
  };

  const allPresets = [...BUILTIN_PRESETS, ...customPresets];

  return (
    <div className="layer-presets">
      <h4 className="presets-title">Presets</h4>
      <div className="preset-buttons">
        {allPresets.map((preset) => (
          <button
            key={preset.id}
            className={`preset-btn ${activePreset === preset.id ? "active" : ""}`}
            onClick={() => applyPreset(preset)}
          >
            {preset.name}
          </button>
        ))}
      </div>
      {showSave ? (
        <div className="save-preset-form">
          <input
            type="text"
            placeholder="Preset name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="save-btn">
            Save
          </button>
          <button onClick={() => setShowSave(false)} className="cancel-btn">
            Cancel
          </button>
        </div>
      ) : (
        <button className="save-preset-toggle" onClick={() => setShowSave(true)}>
          + Save Current as Preset
        </button>
      )}
    </div>
  );
}
