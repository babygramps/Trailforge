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
    useMapStore.setState(useMapStore.getInitialState());
  });

  it("renders builtin preset buttons", () => {
    render(<LayerPresets />);

    expect(screen.getByRole("button", { name: "Hiking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cycling" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Topo Only" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Street Map" })).toBeInTheDocument();
  });

  it("clicking preset calls applyPreset", () => {
    render(<LayerPresets />);

    fireEvent.click(screen.getByRole("button", { name: "Hiking" }));

    const state = useMapStore.getState();
    expect(state.activePreset).toBe("preset-hike");
    const hiking = state.layers.find((l) => l.id === "waymarked-hiking");
    expect(hiking?.visible).toBe(true);
  });

  it("active preset gets highlighted", () => {
    useMapStore.setState({ activePreset: "preset-hike" });

    render(<LayerPresets />);

    const hikeBtn = screen.getByRole("button", { name: "Hiking" });
    expect(hikeBtn.className).toContain("active");

    const bikeBtn = screen.getByRole("button", { name: "Cycling" });
    expect(bikeBtn.className).not.toContain("active");
  });

  it("save custom preset flow", async () => {
    const user = userEvent.setup();
    const { saveLayerPreset } = await import("../../lib/db");

    render(<LayerPresets />);

    await user.click(screen.getByRole("button", { name: "+ Save Current as Preset" }));

    const nameInput = screen.getByPlaceholderText("Preset name");
    expect(nameInput).toBeInTheDocument();

    await user.type(nameInput, "My Custom");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveLayerPreset).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("button", { name: "My Custom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Save Current as Preset" })).toBeInTheDocument();
  });

  it("cancel save hides form", async () => {
    const user = userEvent.setup();
    render(<LayerPresets />);

    await user.click(screen.getByRole("button", { name: "+ Save Current as Preset" }));
    expect(screen.getByPlaceholderText("Preset name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByPlaceholderText("Preset name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Save Current as Preset" })).toBeInTheDocument();
  });
});
