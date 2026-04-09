import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthScreen from "./AuthScreen";
import { useAuthStore } from "../../stores/authStore";

vi.mock("../../api/client", () => ({
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

function getSubmitButton(): HTMLElement {
  return document.querySelector("button[type='submit']")! as HTMLElement;
}

describe("AuthScreen", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login form by default", () => {
    render(<AuthScreen />);
    expect(screen.getByText("TrailForge")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    const submitBtn = document.querySelector("button[type='submit']")!;
    expect(submitBtn.textContent).toBe("Sign In");
  });

  it("switches to register form", async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    // Click the "Register" tab
    const tabs = screen.getAllByRole("button");
    const registerTab = tabs.find((b) => b.textContent === "Register" && b.classList.contains("auth-tab"));
    await user.click(registerTab!);

    expect(screen.getByPlaceholderText("Display name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password (min 8 chars)")).toBeInTheDocument();
    const submitBtn = document.querySelector("button[type='submit']")!;
    expect(submitBtn.textContent).toBe("Create Account");
  });

  it("switches back to login form", async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    const registerTab = screen.getAllByRole("button").find((b) => b.textContent === "Register" && b.classList.contains("auth-tab"));
    await user.click(registerTab!);
    await user.click(screen.getByText("Sign in")); // the switch link

    const submitBtn = document.querySelector("button[type='submit']")!;
    expect(submitBtn.textContent).toBe("Sign In");
    expect(screen.queryByPlaceholderText("Display name")).not.toBeInTheDocument();
  });

  it("calls login on submit", async () => {
    const { apiClient } = await import("../../api/client");
    (apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByPlaceholderText("Email"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith("test@test.com", "password123");
    });
  });

  it("calls register on submit", async () => {
    const { apiClient } = await import("../../api/client");
    (apiClient.register as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    const user = userEvent.setup();
    render(<AuthScreen />);

    const registerTab = screen.getAllByRole("button").find((b) => b.textContent === "Register" && b.classList.contains("auth-tab"));
    await user.click(registerTab!);
    await user.type(screen.getByPlaceholderText("Display name"), "Tester");
    await user.type(screen.getByPlaceholderText("Email"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Password (min 8 chars)"), "password123");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(apiClient.register).toHaveBeenCalledWith("test@test.com", "password123", "Tester");
    });
  });

  it("displays error from store", () => {
    useAuthStore.setState({ error: "Invalid credentials" });
    render(<AuthScreen />);
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("disables submit while loading", () => {
    useAuthStore.setState({ loading: true });
    render(<AuthScreen />);
    const submitBtn = document.querySelector("button[type='submit']") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});
