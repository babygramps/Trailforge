import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "./authStore";
import { apiClient } from "../api/client";

vi.mock("../api/client", () => ({
  apiClient: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    isAuthenticated: vi.fn(() => false),
  },
  ApiError: class extends Error {
    status: number;
    constructor(s: number, m: string) { super(m); this.status = s; }
  },
}));

const mockUser = { id: "u1", email: "test@test.com", displayName: "Tester" };

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no user", () => {
    const { user, loading, error } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it("login sets user on success", async () => {
    (apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    await useAuthStore.getState().login("test@test.com", "password");

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("login sets error on failure", async () => {
    (apiClient.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("invalid credentials")
    );

    await expect(useAuthStore.getState().login("bad@test.com", "wrong")).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.error).toBe("invalid credentials");
    expect(state.loading).toBe(false);
  });

  it("register sets user on success", async () => {
    (apiClient.register as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    await useAuthStore.getState().register("test@test.com", "password", "Tester");

    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("logout clears user", async () => {
    (apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);
    await useAuthStore.getState().login("test@test.com", "password");
    expect(useAuthStore.getState().user).toBeTruthy();

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(apiClient.logout).toHaveBeenCalled();
  });

  it("restoreSession fetches user when tokens exist", async () => {
    (apiClient.isAuthenticated as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (apiClient.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it("restoreSession skips when no tokens", async () => {
    (apiClient.isAuthenticated as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    await useAuthStore.getState().restoreSession();

    expect(apiClient.getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("restoreSession clears on failed getMe", async () => {
    (apiClient.isAuthenticated as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (apiClient.getMe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("expired"));

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(apiClient.logout).toHaveBeenCalled();
  });

  it("clearError resets error", () => {
    useAuthStore.setState({ error: "some error" });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it("parses JSON error messages", async () => {
    (apiClient.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('{"message":"email already registered"}')
    );

    await expect(useAuthStore.getState().login("x@x.com", "pass")).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe("email already registered");
  });
});
