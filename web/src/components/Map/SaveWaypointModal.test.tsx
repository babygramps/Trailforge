import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type maplibregl from "maplibre-gl";
import SaveWaypointModal from "./SaveWaypointModal";
import { useMapStore } from "../../stores/mapStore";

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    GeolocateControl: vi.fn(),
    Marker: vi.fn(),
    Popup: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  }
  return {
    apiClient: {
      createWaypoint: vi.fn(() => Promise.resolve({ id: "wp_1" })),
      getWaypoints: vi.fn(() => Promise.resolve([])),
    },
    ApiError,
  };
});

vi.mock("./MapView", () => ({
  loadWaypoints: vi.fn(() => Promise.resolve()),
}));

describe("SaveWaypointModal", () => {
  beforeEach(() => {
    useMapStore.setState(useMapStore.getInitialState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when no draft", () => {
    const { container } = render(<SaveWaypointModal />);
    expect(container.innerHTML).toBe("");
  });

  it("renders form when draft is set", () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    render(<SaveWaypointModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Waypoint name *")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Description (optional)")).toBeInTheDocument();
    expect(screen.getByText("37.80000°N, 119.50000°W")).toBeInTheDocument();
  });

  it("shows error if name is empty on save", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("calls createWaypoint with form data", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const { apiClient } = await import("../../api/client");
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.type(screen.getByPlaceholderText("Waypoint name *"), "Half Dome");
    await user.type(screen.getByPlaceholderText("Description (optional)"), "Great view");
    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    await waitFor(() => {
      expect(apiClient.createWaypoint).toHaveBeenCalledWith({
        name: "Half Dome",
        description: "Great view",
        lat: 37.8,
        lon: -119.5,
        icon: "pin",
        color: "#ef4444",
      });
    });

    // Modal should close
    expect(useMapStore.getState().waypointDraft).toBeNull();
  });

  it("cancel closes the modal", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.click(screen.getByText("Cancel"));

    expect(useMapStore.getState().waypointDraft).toBeNull();
  });

  it("close button closes the modal", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.click(screen.getByLabelText("Cancel"));

    expect(useMapStore.getState().waypointDraft).toBeNull();
  });

  it("icon selection updates chosen icon", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const { apiClient } = await import("../../api/client");
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.click(screen.getByLabelText("peak"));
    await user.type(screen.getByPlaceholderText("Waypoint name *"), "Summit");
    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    await waitFor(() => {
      expect(apiClient.createWaypoint).toHaveBeenCalledWith(
        expect.objectContaining({ icon: "peak" })
      );
    });
  });

  it("color selection updates chosen color", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const { apiClient } = await import("../../api/client");
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.click(screen.getByLabelText("#3b82f6"));
    await user.type(screen.getByPlaceholderText("Waypoint name *"), "Lake");
    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    await waitFor(() => {
      expect(apiClient.createWaypoint).toHaveBeenCalledWith(
        expect.objectContaining({ color: "#3b82f6" })
      );
    });
  });

  it("refreshes waypoints on map after save", async () => {
    const mockMap = {} as unknown as maplibregl.Map;
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 }, mapInstance: mockMap });
    const { loadWaypoints } = await import("./MapView");
    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.type(screen.getByPlaceholderText("Waypoint name *"), "Point");
    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    await waitFor(() => {
      expect(loadWaypoints).toHaveBeenCalled();
    });
  });

  it("shows friendly message when not signed in", async () => {
    useMapStore.setState({ waypointDraft: { lng: -119.5, lat: 37.8 } });
    const { apiClient } = await import("../../api/client");
    const { ApiError } = await import("../../api/client");
    (apiClient.createWaypoint as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError(401, '{"message":"missing authorization header"}')
    );

    const user = userEvent.setup();
    render(<SaveWaypointModal />);

    await user.type(screen.getByPlaceholderText("Waypoint name *"), "Test");
    await user.click(screen.getByRole("button", { name: "Save Waypoint" }));

    await waitFor(() => {
      expect(screen.getByText("Sign in required to save waypoints")).toBeInTheDocument();
    });
  });
});
