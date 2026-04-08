import { useState, useEffect } from "react";
import { useMapStore } from "../../stores/mapStore";
import { saveLayerPreset, getLayerPresets } from "../../lib/db";
import type { LayerPreset } from "../../types";

const BUILTIN_PRESETS: LayerPreset[] = [
  {
    id: "preset-all",
    name: "All Layers",
    layers: {
      "topo-base": { visible: true, opacity: 1 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: true, opacity: 1 },
    },
  },
  {
    id: "preset-map-only",
    name: "Map Only",
    layers: {
      "topo-base": { visible: true, opacity: 1 },
      "my-tracks": { visible: false, opacity: 1 },
      waypoints: { visible: false, opacity: 1 },
    },
  },
  {
    id: "preset-tracks",
    name: "Tracks Focus",
    layers: {
      "topo-base": { visible: true, opacity: 0.6 },
      "my-tracks": { visible: true, opacity: 1 },
      waypoints: { visible: false, opacity: 1 },
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
