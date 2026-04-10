import { useMapStore } from "../../stores/mapStore";

/**
 * Floating Action Button at the bottom-center of the map.
 * Tap to open the radial quick-action menu at the user's current map center.
 */
export default function MapFAB() {
  const mapInstance = useMapStore((s) => s.mapInstance);
  const radialMenu = useMapStore((s) => s.radialMenu);
  const openRadialMenu = useMapStore((s) => s.openRadialMenu);

  if (radialMenu) return null; // hide FAB when menu is open

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!mapInstance) return;

    // Get the FAB button position to anchor the radial menu
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    // Map center as the geographic coordinate
    const center = mapInstance.getCenter();

    openRadialMenu({
      x,
      y,
      lng: center.lng,
      lat: center.lat,
    });
  };

  return (
    <button
      className="map-fab"
      onClick={handleClick}
      aria-label="Quick actions"
      type="button"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
