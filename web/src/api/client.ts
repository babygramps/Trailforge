import type {
  AuthTokens,
  Track,
  Route,
  Waypoint,
  User,
  GPSPoint,
} from "../types";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

function setTokens(tokens: AuthTokens): void {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
}

function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (res.status === 401 && refreshToken && !extraHeaders["X-Retry"]) {
    await doRefresh();
    return request<T>(path, options, { "X-Retry": "1" });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function doRefresh(): Promise<void> {
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        throw new ApiError(res.status, "Token refresh failed");
      }
      const tokens: AuthTokens = await res.json();
      setTokens(tokens);
    } finally {
      refreshPromise = null;
    }
  })();

  await refreshPromise;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const apiClient = {
  // ---- Auth ----
  async login(email: string, password: string): Promise<User> {
    const tokens = await request<AuthTokens>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(tokens);
    return request<User>("/api/auth/me");
  },

  async register(
    email: string,
    password: string,
    displayName: string
  ): Promise<User> {
    const tokens = await request<AuthTokens>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    setTokens(tokens);
    return request<User>("/api/auth/me");
  },

  async refreshToken(): Promise<void> {
    await doRefresh();
  },

  logout(): void {
    clearTokens();
  },

  isAuthenticated(): boolean {
    return accessToken !== null;
  },

  // ---- Tracks ----
  getTracks(): Promise<Track[]> {
    return request<Track[]>("/api/tracks");
  },

  getTrack(id: string): Promise<Track> {
    return request<Track>(`/api/tracks/${id}`);
  },

  createTrack(data: Partial<Track>): Promise<Track> {
    return request<Track>("/api/tracks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateTrack(id: string, data: Partial<Track>): Promise<Track> {
    return request<Track>(`/api/tracks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteTrack(id: string): Promise<void> {
    return request<void>(`/api/tracks/${id}`, { method: "DELETE" });
  },

  appendPoints(
    sessionId: string,
    points: GPSPoint[],
    idempotencyKey: string
  ): Promise<void> {
    return request<void>(`/api/tracks/sessions/${sessionId}/points`, {
      method: "POST",
      body: JSON.stringify({ points }),
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  exportGPX(trackId: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    return fetch(`/api/tracks/${trackId}/export/gpx`, { headers }).then(
      (res) => {
        if (!res.ok) throw new ApiError(res.status, "GPX export failed");
        return res.blob();
      }
    );
  },

  // ---- Routes ----
  getRoutes(): Promise<Route[]> {
    return request<Route[]>("/api/routes");
  },

  getRoute(id: string): Promise<Route> {
    return request<Route>(`/api/routes/${id}`);
  },

  createRoute(data: Partial<Route>): Promise<Route> {
    return request<Route>("/api/routes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getDirections(
    waypoints: Array<{ lat: number; lon: number }>,
    costing: string
  ): Promise<{ geometry: GeoJSON.Geometry; distance: number; duration: number }> {
    return request("/api/routes/directions", {
      method: "POST",
      body: JSON.stringify({ waypoints, costing }),
    });
  },

  // ---- Waypoints ----
  getWaypoints(): Promise<Waypoint[]> {
    return request<Waypoint[]>("/api/waypoints");
  },

  createWaypoint(data: Partial<Waypoint>): Promise<Waypoint> {
    return request<Waypoint>("/api/waypoints", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateWaypoint(id: string, data: Partial<Waypoint>): Promise<Waypoint> {
    return request<Waypoint>(`/api/waypoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteWaypoint(id: string): Promise<void> {
    return request<void>(`/api/waypoints/${id}`, { method: "DELETE" });
  },
};
