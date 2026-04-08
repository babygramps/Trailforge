import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RecordingControls from "./RecordingControls";
import { useGPS } from "../../hooks/useGPS";

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    GeolocateControl: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock("../../hooks/useGPS", () => ({
  useGPS: vi.fn(() => ({
    currentPosition: null,
    isTracking: false,
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    pauseTracking: vi.fn(),
    resumeTracking: vi.fn(),
    error: null,
    session: null,
    liveStats: { duration: 0, distance: 0, speed: 0, elevationGain: 0 },
  })),
}));

vi.mock("../../api/client", () => ({
  apiClient: {
    createTrack: vi.fn(),
  },
}));

vi.mock("../../lib/db", () => ({
  getPointsBySession: vi.fn(() => Promise.resolve([])),
}));

const mockedUseGPS = vi.mocked(useGPS);

describe("RecordingControls", () => {
  beforeEach(() => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: false,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: null,
      liveStats: { duration: 0, distance: 0, speed: 0, elevationGain: 0 },
    });
  });

  it("shows Start Recording button when idle", () => {
    render(<RecordingControls />);

    expect(screen.getByRole("button", { name: "Start Recording" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("shows Pause and Stop when recording", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 10, distance: 50, speed: 1.2, elevationGain: 5 },
    });

    render(<RecordingControls />);

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Recording" })).not.toBeInTheDocument();
  });

  it("shows Resume and Stop when paused", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: false,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "paused",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 5,
        batchSeq: 0,
      },
      liveStats: { duration: 60, distance: 100, speed: 0, elevationGain: 2 },
    });

    render(<RecordingControls />);

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    // "Stop & Save" is rendered with &amp; in JSX, which renders as "Stop & Save"
    expect(screen.getByRole("button", { name: "Stop & Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Recording" })).not.toBeInTheDocument();
  });

  it("displays live stats", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 10,
        batchSeq: 0,
      },
      liveStats: { duration: 120, distance: 2500, speed: 1.5, elevationGain: 45 },
    });

    render(<RecordingControls />);

    // Distance: 2500m -> "2.50 km"
    expect(screen.getByText("2.50 km")).toBeInTheDocument();
    // Speed: 1.5 m/s -> 5.4 km/h
    expect(screen.getByText("5.4 km/h")).toBeInTheDocument();
    // Elevation gain: 45m
    expect(screen.getByText("45 m")).toBeInTheDocument();
  });

  it("displays GPS accuracy", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: {
        lat: 37.7567,
        lon: -119.5966,
        ele: 1209,
        speed: 0.8,
        accuracy: 12,
        timestamp: Date.now(),
      },
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 0, distance: 0, speed: 0, elevationGain: 0 },
    });

    render(<RecordingControls />);

    expect(screen.getByText("Accuracy: 12 m")).toBeInTheDocument();
  });

  it("displays point count", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 42,
        batchSeq: 0,
      },
      liveStats: { duration: 0, distance: 0, speed: 0, elevationGain: 0 },
    });

    render(<RecordingControls />);

    expect(screen.getByText(/Points recorded: 42/)).toBeInTheDocument();
  });

  it("displays error message", () => {
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: false,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: "GPS unavailable",
      session: null,
      liveStats: { duration: 0, distance: 0, speed: 0, elevationGain: 0 },
    });

    render(<RecordingControls />);

    expect(screen.getByText("GPS unavailable")).toBeInTheDocument();
  });

  it("formatDuration formats correctly", () => {
    // 3661 seconds = 1h 1m 1s -> "1:01:01"
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 3661, distance: 0, speed: 0, elevationGain: 0 },
    });

    render(<RecordingControls />);

    expect(screen.getByText("1:01:01")).toBeInTheDocument();
  });

  it("formatDistance formats metres and km", () => {
    // First test: 500m -> "500 m"
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 0, distance: 500, speed: 0, elevationGain: 0 },
    });

    const { unmount } = render(<RecordingControls />);
    // 500m formats as "500 m" for distance; also elevationGain is "0 m"
    // The Distance stat value should be "500 m"
    const distLabels = screen.getAllByText("500 m");
    expect(distLabels.length).toBeGreaterThanOrEqual(1);
    unmount();

    // Second test: 2345m -> "2.35 km"
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 0, distance: 2345, speed: 0, elevationGain: 0 },
    });

    render(<RecordingControls />);
    expect(screen.getByText("2.35 km")).toBeInTheDocument();
  });

  it("formatSpeed converts m/s to km/h", () => {
    // 2.5 m/s * 3.6 = 9.0 km/h
    mockedUseGPS.mockReturnValue({
      currentPosition: null,
      isTracking: true,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      pauseTracking: vi.fn(),
      resumeTracking: vi.fn(),
      error: null,
      session: {
        id: "s1",
        trackId: "t1",
        state: "recording",
        startedAt: new Date().toISOString(),
        lastPointAt: null,
        pointCount: 0,
        batchSeq: 0,
      },
      liveStats: { duration: 0, distance: 0, speed: 2.5, elevationGain: 0 },
    });

    render(<RecordingControls />);

    expect(screen.getByText("9.0 km/h")).toBeInTheDocument();
  });
});
