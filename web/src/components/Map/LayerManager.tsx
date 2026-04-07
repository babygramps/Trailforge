import { useMapStore } from "../../stores/mapStore";

export default function LayerManager() {
  const { layers, toggleLayerVisibility, setLayerOpacity } = useMapStore();

  return (
    <div className="layer-manager">
      <h3 className="layer-manager-title">Layers</h3>
      <ul className="layer-list">
        {layers.map((layer) => (
          <li key={layer.id} className="layer-item">
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={() => toggleLayerVisibility(layer.id)}
              />
              <span className="layer-name">{layer.name}</span>
            </label>
            <div className="layer-opacity">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={layer.opacity}
                disabled={!layer.visible}
                onChange={(e) =>
                  setLayerOpacity(layer.id, parseFloat(e.target.value))
                }
              />
              <span className="opacity-value">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
