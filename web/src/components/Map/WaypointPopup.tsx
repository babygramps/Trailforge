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
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function iconLabel(value: string): string {
  return ICONS.find((i) => i.value === value)?.label ?? "\u{1F4CD}";
}

type Mode = "view" | "edit";

export default function WaypointPopup() {
  const wp = useMapStore((s) => s.selectedWaypoint);
  const setSelected = useMapStore((s) => s.setSelectedWaypoint);
  const mapInstance = useMapStore((s) => s.mapInstance);

  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("pin");
  const [color, setColor] = useState("#ef4444");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!wp) return null;

  const close = () => {
    setSelected(null);
    setMode("view");
    setConfirmDelete(false);
    setError(null);
  };

  const startEdit = () => {
    setName(wp.name);
    setDescription(wp.description);
    setIcon(wp.icon);
    setColor(wp.color);
    setError(null);
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
    setError(null);
  };

  const saveEdit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.updateWaypoint(wp.id, {
        name: name.trim(),
        description: description.trim(),
        lat: wp.lat,
        lon: wp.lon,
        ele: wp.ele,
        icon,
        color,
      });
      if (mapInstance) await loadWaypoints(mapInstance);
      setSelected({
        ...wp,
        name: name.trim(),
        description: description.trim(),
        icon,
        color,
      });
      setMode("view");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Sign in required");
      } else {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await apiClient.deleteWaypoint(wp.id);
      if (mapInstance) await loadWaypoints(mapInstance);
      close();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Sign in required");
      } else {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const latStr =
    Math.abs(wp.lat).toFixed(5) + (wp.lat >= 0 ? "\u00B0N" : "\u00B0S");
  const lonStr =
    Math.abs(wp.lon).toFixed(5) + (wp.lon >= 0 ? "\u00B0E" : "\u00B0W");

  if (mode === "edit") {
    return (
      <>
        <div className="wp-popup-backdrop" onClick={cancelEdit} />
        <div className="wp-popup wp-popup-edit" role="dialog" aria-label="Edit waypoint">
          <div className="wp-popup-header">
            <span className="wp-popup-title">Edit Waypoint</span>
            <button className="wp-popup-close" onClick={cancelEdit} aria-label="Cancel">
              &times;
            </button>
          </div>

          {error && <div className="wp-popup-error">{error}</div>}

          <div className="wp-popup-field">
            <input
              type="text"
              placeholder="Waypoint name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="waypoint-input"
            />
          </div>
          <div className="wp-popup-field">
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="waypoint-input"
            />
          </div>

          <div className="wp-popup-field">
            <label className="waypoint-field-label">Icon</label>
            <div className="waypoint-icon-grid">
              {ICONS.map((ic) => (
                <button
                  key={ic.value}
                  className={`waypoint-icon-btn ${icon === ic.value ? "active" : ""}`}
                  onClick={() => setIcon(ic.value)}
                  type="button"
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wp-popup-field">
            <label className="waypoint-field-label">Color</label>
            <div className="waypoint-color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`waypoint-color-btn ${color === c ? "active" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="wp-popup-actions">
            <button className="wp-btn-secondary" onClick={cancelEdit} type="button">
              Cancel
            </button>
            <button className="wp-btn-primary" onClick={saveEdit} disabled={saving} type="button">
              {saving ? "Saving\u2026" : "Save"}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="wp-popup-backdrop" onClick={close} />
      <div className="wp-popup" role="dialog" aria-label="Waypoint details">
        <div className="wp-popup-header">
          <span className="wp-popup-icon" style={{ color: wp.color }}>
            {iconLabel(wp.icon)}
          </span>
          <span className="wp-popup-title">{wp.name}</span>
          <button className="wp-popup-close" onClick={close} aria-label="Close">
            &times;
          </button>
        </div>

        {wp.description && (
          <p className="wp-popup-desc">{wp.description}</p>
        )}

        <div className="wp-popup-coords">
          <span>{latStr}, {lonStr}</span>
          {wp.ele > 0 && <span className="wp-popup-ele">{Math.round(wp.ele)}m</span>}
        </div>

        {error && <div className="wp-popup-error">{error}</div>}

        <div className="wp-popup-actions">
          <button className="wp-btn-secondary" onClick={startEdit} type="button">
            Edit
          </button>
          <button
            className={`wp-btn-danger ${confirmDelete ? "confirming" : ""}`}
            onClick={handleDelete}
            disabled={deleting}
            type="button"
          >
            {deleting
              ? "Deleting\u2026"
              : confirmDelete
                ? "Confirm Delete"
                : "Delete"}
          </button>
        </div>
      </div>
    </>
  );
}
