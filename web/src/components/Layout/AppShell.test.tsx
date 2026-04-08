import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppShell from "./AppShell";
import { useOfflineSync } from "../../hooks/useOfflineSync";

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    GeolocateControl: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock("../../hooks/useOfflineSync", () => ({
  useOfflineSync: vi.fn(() => ({
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    triggerSync: vi.fn(),
  })),
}));

const mockedUseOfflineSync = vi.mocked(useOfflineSync);

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    mockedUseOfflineSync.mockReturnValue({
      isSyncing: false,
      pendingCount: 0,
      lastSyncAt: null,
      triggerSync: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it("renders bottom navigation with 4 links", () => {
    renderWithRouter();

    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Tracks")).toBeInTheDocument();
    expect(screen.getByText("Record")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("shows sync bar when syncing", () => {
    mockedUseOfflineSync.mockReturnValue({
      isSyncing: true,
      pendingCount: 3,
      lastSyncAt: null,
      triggerSync: vi.fn(),
    });

    renderWithRouter();

    expect(screen.getByText("Syncing...")).toBeInTheDocument();
  });

  it("shows pending count", () => {
    mockedUseOfflineSync.mockReturnValue({
      isSyncing: false,
      pendingCount: 5,
      lastSyncAt: null,
      triggerSync: vi.fn(),
    });

    renderWithRouter();

    expect(screen.getByText("5 points pending sync")).toBeInTheDocument();
  });

  it("shows offline bar when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    renderWithRouter();

    expect(screen.getByText("Offline mode")).toBeInTheDocument();
  });

  it("hides sync bar when idle", () => {
    mockedUseOfflineSync.mockReturnValue({
      isSyncing: false,
      pendingCount: 0,
      lastSyncAt: null,
      triggerSync: vi.fn(),
    });

    renderWithRouter();

    expect(screen.queryByText("Syncing...")).not.toBeInTheDocument();
    expect(screen.queryByText(/pending sync/)).not.toBeInTheDocument();
  });
});
