import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LayerPresets from "./LayerPresets";
import { useMapStore } from "../../stores/mapStore";

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    GeolocateControl: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock("../../lib/db", () => ({
  getLayerPresets: vi.fn(() => Promise.resolve([])),
  saveLayerPreset: vi.fn(() => Promise.resolve()),
}));

describe("LayerPresets", () => {
  beforeEach(() => {
    useMapStore.setState({
      layers: [
        { id: "topo-base", name: "Topo Base", type: "vector", visible: true, opacity: 1, sourceUrl: "" },
        { id: "satellite", name: "Satellite", type: "raster", visible: false, opacity: 1, sourceUrl: "" },
        { id: "hillshade", name: "Hillshade", type: "raster", visible: true, opacity: 0.3, sourceUrl: "" },
        { id: "contours", name: "Contours", type: "vector", visible: true, opacity: 0.6, sourceUrl: "" },
        { id: "public-land", name: "Public Land", type: "vector", visible: false, opacity: 0.4, sourceUrl: "" },
        { id: "trails", name: "Trail Network", type: "vector", visible: true, opacity: 0.8, sourceUrl: "" },
        { id: "my-tracks", name: "My Tracks", type: "geojson", visible: true, opacity: 1, sourceUrl: "" },
        { id: "waypoints", name: "Waypoints", type: "geojson", visible: true, opacity: 1, sourceUrl: "" },
      ],
      activePreset: null,
    });
  });

  it("renders builtin preset buttons", () => {
    render(<LayerPresets />);

    expect(screen.getByRole("button", { name: "Topo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Satellite+Topo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public Land" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimal" })).toBeInTheDocument();
  });

  it("clicking preset calls applyPreset", () => {
    render(<LayerPresets />);

    fireEvent.click(screen.getByRole("button", { name: "Minimal" }));

    const state = useMapStore.getState();
    expect(state.activePreset).toBe("preset-minimal");
    // Minimal preset sets hillshade to not visible
    const hillshade = state.layers.find((l) => l.id === "hillshade");
    expect(hillshade?.visible).toBe(false);
  });

  it("active preset gets highlighted", () => {
    useMapStore.setState({ activePreset: "preset-topo" });

    render(<LayerPresets />);

    const topoBtn = screen.getByRole("button", { name: "Topo" });
    expect(topoBtn.className).toContain("active");

    const minimalBtn = screen.getByRole("button", { name: "Minimal" });
    expect(minimalBtn.className).not.toContain("active");
  });

  it("save custom preset flow", async () => {
    const user = userEvent.setup();
    const { saveLayerPreset } = await import("../../lib/db");

    render(<LayerPresets />);

    // Click the save toggle button
    await user.click(screen.getByRole("button", { name: "+ Save Current as Preset" }));

    // The form should now be visible
    const nameInput = screen.getByPlaceholderText("Preset name");
    expect(nameInput).toBeInTheDocument();

    // Type a name and submit
    await user.type(nameInput, "My Custom");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Should have called saveLayerPreset
    await waitFor(() => {
      expect(saveLayerPreset).toHaveBeenCalledTimes(1);
    });

    // The custom preset button should now appear
    expect(screen.getByRole("button", { name: "My Custom" })).toBeInTheDocument();

    // Form should be hidden again (save toggle button visible)
    expect(screen.getByRole("button", { name: "+ Save Current as Preset" })).toBeInTheDocument();
  });

  it("cancel save hides form", async () => {
    const user = userEvent.setup();
    render(<LayerPresets />);

    // Open save form
    await user.click(screen.getByRole("button", { name: "+ Save Current as Preset" }));
    expect(screen.getByPlaceholderText("Preset name")).toBeInTheDocument();

    // Click cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Form should be hidden
    expect(screen.queryByPlaceholderText("Preset name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Save Current as Preset" })).toBeInTheDocument();
  });
});
