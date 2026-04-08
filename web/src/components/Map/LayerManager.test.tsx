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
    expect(layerItems).toHaveLength(3);

    expect(screen.getByText("OpenTopoMap")).toBeInTheDocument();
    expect(screen.getByText("My Tracks")).toBeInTheDocument();
    expect(screen.getByText("Waypoints")).toBeInTheDocument();
  });

  it("checkbox toggles layer visibility", () => {
    render(<LayerManager />);

    const checkboxes = screen.getAllByRole("checkbox");
    // "My Tracks" is the 2nd layer and is visible
    const tracksCheckbox = checkboxes[1];
    expect(tracksCheckbox).toBeChecked();

    fireEvent.click(tracksCheckbox);

    const state = useMapStore.getState();
    const tracks = state.layers.find((l) => l.id === "my-tracks");
    expect(tracks?.visible).toBe(false);
  });

  it("slider updates opacity", () => {
    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    // "Base Map" is the 1st layer, visible=true, opacity=1
    const topoSlider = sliders[0];

    fireEvent.change(topoSlider, { target: { value: "0.5" } });

    const state = useMapStore.getState();
    const topo = state.layers.find((l) => l.id === "topo-base");
    expect(topo?.opacity).toBe(0.5);
  });

  it("disabled slider when layer is not visible", () => {
    // Set my-tracks to not visible
    useMapStore.getState().toggleLayerVisibility("my-tracks");

    render(<LayerManager />);

    const sliders = screen.getAllByRole("slider");
    // "my-tracks" is the 2nd layer and now visible=false
    const tracksSlider = sliders[1];
    expect(tracksSlider).toBeDisabled();

    // "Base Map" is visible, so its slider should be enabled
    const topoSlider = sliders[0];
    expect(topoSlider).not.toBeDisabled();
  });
});
