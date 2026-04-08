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
    useMapStore.setState(useMapStore.getInitialState());
  });

  it("renders all default layers", () => {
    render(<LayerManager />);

    const layerItems = screen.getAllByRole("listitem");
    expect(layerItems).toHaveLength(7);

    expect(screen.getByText("OpenTopoMap")).toBeInTheDocument();
    expect(screen.getByText("OpenStreetMap")).toBeInTheDocument();
    expect(screen.getByText("CyclOSM (Bike)")).toBeInTheDocument();
    expect(screen.getByText("Hiking Trails")).toBeInTheDocument();
    expect(screen.getByText("Cycling Routes")).toBeInTheDocument();
    expect(screen.getByText("My Tracks")).toBeInTheDocument();
    expect(screen.getByText("Waypoints")).toBeInTheDocument();
  });

  it("checkbox toggles layer visibility", () => {
    render(<LayerManager />);

    const checkboxes = screen.getAllByRole("checkbox");
    // "OpenStreetMap" is the 2nd layer and is not visible
    const osmCheckbox = checkboxes[1];
    expect(osmCheckbox).not.toBeChecked();

    fireEvent.click(osmCheckbox);

    const state = useMapStore.getState();
    const osm = state.layers.find((l) => l.id === "osm");
    expect(osm?.visible).toBe(true);
  });

  it("slider updates opacity", () => {
    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    const topoSlider = sliders[0];

    fireEvent.change(topoSlider, { target: { value: "0.5" } });

    const state = useMapStore.getState();
    const topo = state.layers.find((l) => l.id === "topo-base");
    expect(topo?.opacity).toBe(0.5);
  });

  it("disabled slider when layer is not visible", () => {
    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    // "osm" is the 2nd layer and visible=false
    const osmSlider = sliders[1];
    expect(osmSlider).toBeDisabled();

    // "topo-base" is visible, so its slider should be enabled
    const topoSlider = sliders[0];
    expect(topoSlider).not.toBeDisabled();
  });
});
