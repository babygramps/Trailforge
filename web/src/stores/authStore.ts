import { create } from "zustand";
import { apiClient } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const user = await apiClient.login(email, password);
      set({ user, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      set({ loading: false, error: parseError(message) });
      throw err;
    }
  },

  register: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const user = await apiClient.register(email, password, displayName);
      set({ user, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      set({ loading: false, error: parseError(message) });
      throw err;
    }
  },

  logout: () => {
    apiClient.logout();
    set({ user: null, error: null });
  },

  restoreSession: async () => {
    if (!apiClient.isAuthenticated()) return;
    set({ loading: true });
    try {
      const user = await apiClient.getMe();
      set({ user, loading: false });
    } catch {
      // Token expired or invalid — clear silently
      apiClient.logout();
      set({ user: null, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

function parseError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed.message || raw;
  } catch {
    return raw;
  }
}
