import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMapStore } from "../../stores/mapStore";

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

export default function RadialMenu() {
  const menu = useMapStore((s) => s.radialMenu);
  const close = useMapStore((s) => s.closeRadialMenu);
  const setDraft = useMapStore((s) => s.setWaypointDraft);
  const navigate = useNavigate();

  const handleWaypointHere = useCallback(() => {
    if (!menu) return;
    setDraft({ lng: menu.lng, lat: menu.lat });
    close();
  }, [menu, setDraft, close]);

  const handleWaypointAtMe = useCallback(() => {
    close();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({ lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [setDraft, close]);

  const handleRecord = useCallback(() => {
    close();
    navigate("/record");
  }, [close, navigate]);

  // Close on Escape
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, close]);

  if (!menu) return null;

  const items: MenuItem[] = [
    { id: "wp-here", label: "Waypoint Here", icon: "\u{1F4CD}", action: handleWaypointHere },
    { id: "wp-me", label: "Waypoint at Me", icon: "\u{1F4F1}", action: handleWaypointAtMe },
    { id: "record", label: "Record", icon: "\u{1F534}", action: handleRecord },
  ];

  // Position the menu, clamping to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const RADIUS = 90;

  // If the trigger is in the bottom 30% of the screen, arc upward.
  // Otherwise arc downward. This keeps options on-screen.
  const arcUp = menu.y > vh * 0.4;

  // Spread items in a semicircle (180°)
  const startAngle = arcUp ? -180 : 0; // degrees
  const sweepAngle = 180;
  const step = items.length > 1 ? sweepAngle / (items.length - 1) : 0;

  // Clamp menu origin so items don't go off-screen
  const cx = Math.max(RADIUS + 20, Math.min(menu.x, vw - RADIUS - 20));
  const cy = menu.y;

  return (
    <>
      <div className="radial-backdrop" onClick={close} />
      <div
        className="radial-menu"
        style={{ left: cx, top: cy }}
        role="menu"
        aria-label="Quick actions"
      >
        {/* Center dot */}
        <div className="radial-center" />

        {items.map((item, i) => {
          const angleDeg = startAngle + step * i;
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = Math.cos(angleRad) * RADIUS;
          const y = Math.sin(angleRad) * RADIUS;

          return (
            <button
              key={item.id}
              className="radial-item"
              style={{
                "--rx": `${x}px`,
                "--ry": `${y}px`,
                animationDelay: `${i * 40}ms`,
              } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                item.action();
              }}
              role="menuitem"
              aria-label={item.label}
            >
              <span className="radial-item-icon">{item.icon}</span>
              <span className="radial-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
