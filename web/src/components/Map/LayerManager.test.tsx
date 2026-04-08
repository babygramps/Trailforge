import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LayerManager from "./LayerManager";
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

describe("LayerManager", () => {
  beforeEach(() => {
    // Reset the Zustand store to its default state before each test
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

  it("renders all default layers", () => {
    render(<LayerManager />);

    const layerItems = screen.getAllByRole("listitem");
    expect(layerItems).toHaveLength(8);

    expect(screen.getByText("Topo Base")).toBeInTheDocument();
    expect(screen.getByText("Satellite")).toBeInTheDocument();
    expect(screen.getByText("Hillshade")).toBeInTheDocument();
    expect(screen.getByText("Contours")).toBeInTheDocument();
    expect(screen.getByText("Public Land")).toBeInTheDocument();
    expect(screen.getByText("Trail Network")).toBeInTheDocument();
    expect(screen.getByText("My Tracks")).toBeInTheDocument();
    expect(screen.getByText("Waypoints")).toBeInTheDocument();
  });

  it("checkbox toggles layer visibility", () => {
    render(<LayerManager />);

    const checkboxes = screen.getAllByRole("checkbox");
    // "Satellite" is the 2nd layer and is not visible
    const satelliteCheckbox = checkboxes[1];
    expect(satelliteCheckbox).not.toBeChecked();

    fireEvent.click(satelliteCheckbox);

    // After toggle, "satellite" layer should now be visible
    const state = useMapStore.getState();
    const satellite = state.layers.find((l) => l.id === "satellite");
    expect(satellite?.visible).toBe(true);
  });

  it("slider updates opacity", () => {
    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    // "Topo Base" is the 1st layer, visible=true, opacity=1
    const topoSlider = sliders[0];

    fireEvent.change(topoSlider, { target: { value: "0.5" } });

    const state = useMapStore.getState();
    const topo = state.layers.find((l) => l.id === "topo-base");
    expect(topo?.opacity).toBe(0.5);
  });

  it("disabled slider when layer is not visible", () => {
    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    // "Satellite" is the 2nd layer and visible=false
    const satelliteSlider = sliders[1];
    expect(satelliteSlider).toBeDisabled();

    // "Public Land" is the 5th layer and visible=false
    const publicLandSlider = sliders[4];
    expect(publicLandSlider).toBeDisabled();

    // "Topo Base" is visible, so its slider should be enabled
    const topoSlider = sliders[0];
    expect(topoSlider).not.toBeDisabled();
  });
});
