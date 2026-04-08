import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TrackList from "./TrackList";
import { apiClient } from "../../api/client";
import { useMapStore } from "../../stores/mapStore";
import { mockTrackList } from "../../__fixtures__/tracks";

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    GeolocateControl: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  apiClient: {
    getTracks: vi.fn(),
    deleteTrack: vi.fn(),
    exportGPX: vi.fn(),
  },
}));

const mockedGetTracks = vi.mocked(apiClient.getTracks);
const mockedDeleteTrack = vi.mocked(apiClient.deleteTrack);
const mockedExportGPX = vi.mocked(apiClient.exportGPX);

describe("TrackList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMapStore.setState({ selectedTrackId: null });
  });

  it("shows loading state initially", () => {
    // getTracks never resolves so loading state persists
    mockedGetTracks.mockReturnValue(new Promise(() => {}));

    render(<TrackList />);

    expect(screen.getByText("Loading tracks...")).toBeInTheDocument();
  });

  it("renders track list after load", async () => {
    mockedGetTracks.mockResolvedValue(mockTrackList);

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    expect(screen.getByText("Morning Bay Ride")).toBeInTheDocument();
    expect(screen.getByText("Lake Tahoe Paddle")).toBeInTheDocument();

    // Should have 3 track items
    const trackItems = screen.getAllByRole("listitem");
    expect(trackItems).toHaveLength(3);
  });

  it("shows empty state when no tracks", async () => {
    mockedGetTracks.mockResolvedValue([]);

    render(<TrackList />);

    await waitFor(() => {
      expect(
        screen.getByText("No tracks yet. Go record your first adventure!")
      ).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockedGetTracks.mockRejectedValue(new Error("Network error"));

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("delete button removes track", async () => {
    mockedGetTracks.mockResolvedValue([...mockTrackList]);
    mockedDeleteTrack.mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    // Click the first delete button
    const deleteButtons = screen.getAllByTitle("Delete");
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith("Delete this track?");
    expect(mockedDeleteTrack).toHaveBeenCalledWith("trk_yosemite_001");

    // Track should be removed from the list
    await waitFor(() => {
      expect(screen.queryByText("Yosemite Valley Loop")).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it("GPX export button triggers download", async () => {
    mockedGetTracks.mockResolvedValue([...mockTrackList]);
    mockedExportGPX.mockResolvedValue(new Blob(["<gpx/>"], { type: "application/gpx+xml" }));

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    const exportButtons = screen.getAllByTitle("Export GPX");
    fireEvent.click(exportButtons[0]);

    expect(mockedExportGPX).toHaveBeenCalledWith("trk_yosemite_001");
  });

  it("view on map sets selected track", async () => {
    mockedGetTracks.mockResolvedValue([...mockTrackList]);

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    // Click on the track-info div (contains the track name)
    const trackInfo = screen.getByText("Yosemite Valley Loop").closest(".track-info");
    fireEvent.click(trackInfo!);

    const state = useMapStore.getState();
    expect(state.selectedTrackId).toBe("trk_yosemite_001");
  });

  it("formats date correctly", async () => {
    mockedGetTracks.mockResolvedValue([...mockTrackList]);

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    // "2025-07-15T08:00:00Z" should be formatted as a localized date string.
    // The exact output depends on locale, but we check that it includes "Jul" and "2025"
    const dateElements = document.querySelectorAll(".track-date");
    expect(dateElements.length).toBe(3);
    // The first track date should contain "Jul" somewhere (short month format)
    expect(dateElements[0].textContent).toContain("Jul");
    expect(dateElements[0].textContent).toContain("2025");
  });

  it("formats distance and duration", async () => {
    mockedGetTracks.mockResolvedValue([...mockTrackList]);

    render(<TrackList />);

    await waitFor(() => {
      expect(screen.getByText("Yosemite Valley Loop")).toBeInTheDocument();
    });

    // Yosemite track: distance=1847.3m -> "1.8 km" (1 decimal), duration=2400s -> "40m"
    expect(screen.getByText("1.8 km")).toBeInTheDocument();
    expect(screen.getByText("40m")).toBeInTheDocument();

    // Bike track: distance=620.5m -> "621 m", duration=180s -> "3m"
    expect(screen.getByText("621 m")).toBeInTheDocument();
    expect(screen.getByText("3m")).toBeInTheDocument();

    // Paddle track: distance=450m -> "450 m", duration=900s -> "15m"
    expect(screen.getByText("450 m")).toBeInTheDocument();
    expect(screen.getByText("15m")).toBeInTheDocument();
  });
});
