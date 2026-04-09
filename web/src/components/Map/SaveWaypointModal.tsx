import { useState } from "react";
import { useMapStore } from "../../stores/mapStore";
import { apiClient, ApiError } from "../../api/client";
import { loadWaypoints } from "./MapView";

const ICONS = [
  { value: "pin", label: "\u{1F4CD}" },
  { value: "peak", label: "\u26F0\uFE0F" },
  { value: "camp", label: "\u{1F3D5}\uFE0F" },
  { value: "water", label: "\u{1F4A7}" },
  { value: "viewpoint", label: "\u{1F441}\uFE0F" },
  { value: "parking", label: "\u{1F17F}\uFE0F" },
  { value: "warning", label: "\u26A0\uFE0F" },
  { value: "star", label: "\u2B50" },
];

const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
];

export default function SaveWaypointModal() {
  const draft = useMapStore((s) => s.waypointDraft);
  const setDraft = useMapStore((s) => s.setWaypointDraft);
  const mapInstance = useMapStore((s) => s.mapInstance);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("pin");
  const [color, setColor] = useState("#ef4444");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) return null;

  const cancel = () => {
    setDraft(null);
    setName("");
    setDescription("");
    setIcon("pin");
    setColor("#ef4444");
    setError(null);
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiClient.createWaypoint({
        name: name.trim(),
        description: description.trim(),
        lat: draft.lat,
        lon: draft.lng,
        icon,
        color,
      });

      // Refresh waypoints on the map
      if (mapInstance) {
        await loadWaypoints(mapInstance);
      }

      cancel();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Sign in required to save waypoints");
      } else {
        setError(err instanceof Error ? err.message : "Failed to save waypoint");
      }
    } finally {
      setSaving(false);
    }
  };

  const latStr = Math.abs(draft.lat).toFixed(5) + (draft.lat >= 0 ? "\u00B0N" : "\u00B0S");
  const lngStr = Math.abs(draft.lng).toFixed(5) + (draft.lng >= 0 ? "\u00B0E" : "\u00B0W");

  return (
    <>
      <div className="waypoint-modal-backdrop" onClick={cancel} />
      <div className="waypoint-modal" role="dialog" aria-label="Save waypoint">
        <div className="waypoint-modal-header">
          <span className="waypoint-modal-title">Save Waypoint</span>
          <button className="waypoint-modal-close" onClick={cancel} aria-label="Cancel">
            &times;
          </button>
        </div>

        <div className="waypoint-modal-coords">
          {latStr}, {lngStr}
        </div>

        {error && <div className="waypoint-modal-error">{error}</div>}

        <div className="waypoint-modal-field">
          <input
            type="text"
            placeholder="Waypoint name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="waypoint-input"
          />
        </div>

        <div className="waypoint-modal-field">
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="waypoint-input"
          />
        </div>

        <div className="waypoint-modal-field">
          <label className="waypoint-field-label">Icon</label>
          <div className="waypoint-icon-grid">
            {ICONS.map((ic) => (
              <button
                key={ic.value}
                className={`waypoint-icon-btn ${icon === ic.value ? "active" : ""}`}
                onClick={() => setIcon(ic.value)}
                aria-label={ic.value}
                type="button"
              >
                {ic.label}
              </button>
            ))}
          </div>
        </div>

        <div className="waypoint-modal-field">
          <label className="waypoint-field-label">Color</label>
          <div className="waypoint-color-grid">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`waypoint-color-btn ${color === c ? "active" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                aria-label={c}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="waypoint-modal-actions">
          <button className="waypoint-cancel-btn" onClick={cancel} type="button">
            Cancel
          </button>
          <button
            className="waypoint-save-btn"
            onClick={save}
            disabled={saving}
            type="button"
          >
            {saving ? "Saving\u2026" : "Save Waypoint"}
          </button>
        </div>
      </div>
    </>
  );
}
