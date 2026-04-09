import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MapSearch from "./MapSearch";
import { useMapStore } from "../../stores/mapStore";

vi.mock("maplibre-gl", () => {
  const markerProto = {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    togglePopup: vi.fn(),
    remove: vi.fn(),
  };

  const popupProto = {
    setText: vi.fn().mockReturnThis(),
  };

  class MockMarker {
    setLngLat = markerProto.setLngLat;
    setPopup = markerProto.setPopup;
    addTo = markerProto.addTo;
    togglePopup = markerProto.togglePopup;
    remove = markerProto.remove;
  }

  class MockPopup {
    setText = popupProto.setText;
  }

  return {
    default: {
      Map: vi.fn(),
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      GeolocateControl: vi.fn(),
      Marker: MockMarker,
      Popup: MockPopup,
    },
    Map: vi.fn(),
    Marker: MockMarker,
    Popup: MockPopup,
    __markerProto: markerProto,
    __popupProto: popupProto,
  };
});

const mockPhotonResponse = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-119.59, 37.75] },
      properties: {
        name: "Yosemite Valley",
        osm_key: "place",
        osm_value: "locality",
        state: "California",
        country: "United States",
        extent: [-119.65, 37.71, -119.53, 37.79],
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-119.53, 37.73] },
      properties: {
        name: "Half Dome Trail",
        osm_key: "highway",
        osm_value: "path",
        city: "Yosemite",
        state: "California",
        country: "United States",
      },
    },
  ],
};

describe("MapSearch", () => {
  let markerMock: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    useMapStore.setState(useMapStore.getInitialState());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();

    // Access the shared mock instances from the vi.mock factory
    const mgl = await import("maplibre-gl") as unknown as {
      __markerProto: Record<string, ReturnType<typeof vi.fn>>;
      __popupProto: Record<string, ReturnType<typeof vi.fn>>;
    };
    markerMock = mgl.__markerProto;
    for (const fn of Object.values(markerMock)) fn.mockClear().mockReturnThis();
    markerMock.togglePopup.mockClear();
    markerMock.remove.mockClear();
    for (const fn of Object.values(mgl.__popupProto)) fn.mockClear().mockReturnThis();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders search input", () => {
    render(<MapSearch />);
    expect(screen.getByPlaceholderText("Search trails, places...")).toBeInTheDocument();
  });

  it("shows results after typing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPhotonResponse),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Yosemite");

    // Wait for debounce + fetch
    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley")).toBeInTheDocument();
      expect(screen.getByText("Half Dome Trail")).toBeInTheDocument();
    });
  });

  it("shows subtitle with location context", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPhotonResponse),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Yosemite");

    await waitFor(() => {
      expect(screen.getByText("California, United States")).toBeInTheDocument();
    });
  });

  it("selecting a result calls flyTo and closes dropdown", async () => {
    const flyTo = vi.fn();
    const fitBounds = vi.fn();
    useMapStore.setState({
      mapInstance: { flyTo, fitBounds } as unknown as maplibregl.Map,
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPhotonResponse),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Yosemite");

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Yosemite Valley"));

    // Yosemite Valley has extent, so fitBounds should be called
    expect(fitBounds).toHaveBeenCalledTimes(1);
    // Pin should be placed at result coordinates
    expect(markerMock.setLngLat).toHaveBeenCalledWith([-119.59, 37.75]);
    expect(markerMock.addTo).toHaveBeenCalledTimes(1);
    expect(markerMock.togglePopup).toHaveBeenCalledTimes(1);
    // Dropdown should close
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selecting a result without extent calls flyTo", async () => {
    const flyTo = vi.fn();
    const fitBounds = vi.fn();
    useMapStore.setState({
      mapInstance: { flyTo, fitBounds } as unknown as maplibregl.Map,
    });

    const singleResult = {
      type: "FeatureCollection",
      features: [mockPhotonResponse.features[1]], // Half Dome Trail - no extent
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(singleResult),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Half Dome");

    await waitFor(() => {
      expect(screen.getByText("Half Dome Trail")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Half Dome Trail"));

    expect(flyTo).toHaveBeenCalledWith({
      center: [-119.53, 37.73],
      zoom: 15,
      duration: 1200,
    });
  });

  it("clear button clears query and results", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPhotonResponse),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Yosemite");

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Clear search"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search trails, places...")).toHaveValue("");
  });

  it("clear button removes the search pin", async () => {
    const flyTo = vi.fn();
    const fitBounds = vi.fn();
    useMapStore.setState({
      mapInstance: { flyTo, fitBounds } as unknown as maplibregl.Map,
    });

    const singleResult = {
      type: "FeatureCollection",
      features: [mockPhotonResponse.features[1]],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(singleResult),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Half Dome");

    await waitFor(() => {
      expect(screen.getByText("Half Dome Trail")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Half Dome Trail"));
    expect(markerMock.addTo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText("Clear search"));
    expect(markerMock.remove).toHaveBeenCalledTimes(1);
  });

  it("does not search for queries shorter than 2 chars", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MapSearch />);

    await user.type(screen.getByPlaceholderText("Search trails, places..."), "Y");

    vi.advanceTimersByTime(500);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
