import type {
  AuthTokens,
  Track,
  Route,
  Waypoint,
  User,
  GPSPoint,
} from "../types";

const TOKEN_KEY = "tf_tokens";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

function setTokens(tokens: AuthTokens): void {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // Storage unavailable (private browsing, etc.)
  }
}

function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function restoreTokens(): void {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) {
      const tokens: AuthTokens = JSON.parse(raw);
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
    }
  } catch {
    // corrupt or unavailable
  }
}

// Restore tokens on module load
restoreTokens();

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

// The Go backend uses snake_case JSON; map to camelCase on the frontend.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(raw: any): User {
  return {
    id: raw.id,
    email: raw.email,
    displayName: raw.display_name ?? raw.displayName ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTrack(raw: any): Track {
  const stats = raw.stats ?? {};
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? "",
    name: raw.name ?? "",
    activityType: raw.activity_type ?? raw.activityType ?? "hike",
    description: raw.description ?? "",
    geometry: raw.geometry,
    stats: {
      distance: stats.distance_m ?? stats.distance ?? 0,
      duration: stats.duration_s ?? stats.duration ?? 0,
      elevationGain: stats.elevation_gain_m ?? stats.elevationGain ?? 0,
      elevationLoss: stats.elevation_loss_m ?? stats.elevationLoss ?? 0,
      avgSpeed: stats.avg_speed_mps ?? stats.avgSpeed ?? 0,
      hrZones: stats.hr_zones ?? stats.hrZones ?? null,
    },
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    updatedAt: raw.updated_at ?? raw.updatedAt ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWaypoint(raw: any): Waypoint {
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
    lat: raw.lat ?? 0,
    lon: raw.lon ?? 0,
    ele: raw.ele ?? null,
    icon: raw.icon ?? "pin",
    color: raw.color ?? "#FF5722",
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    updatedAt: raw.updated_at ?? raw.updatedAt ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRoute(raw: any): Route {
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? "",
    name: raw.name ?? "",
    activityType: raw.activity_type ?? raw.activityType ?? "hike",
    description: raw.description ?? "",
    geometry: raw.geometry,
    waypoints: raw.waypoints ?? [],
    totalDistance: raw.total_distance ?? raw.totalDistance ?? 0,
    estimatedDuration: raw.estimated_duration ?? raw.estimatedDuration ?? 0,
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    updatedAt: raw.updated_at ?? raw.updatedAt ?? "",
  };
}

// Response shape from login/register endpoints
interface AuthResponse {
  user: unknown;
  tokens: AuthTokens;
}

export const apiClient = {
  // ---- Auth ----
  async login(email: string, password: string): Promise<User> {
    const res = await request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(res.tokens);
    return mapUser(res.user);
  },

  async register(
    email: string,
    password: string,
    displayName: string
  ): Promise<User> {
    const res = await request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    setTokens(res.tokens);
    return mapUser(res.user);
  },

  async getMe(): Promise<User> {
    const raw = await request<unknown>("/api/auth/me");
    return mapUser(raw);
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

  async forgotPassword(email: string): Promise<string> {
    const res = await request<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return res.message;
  },

  async resetPassword(token: string, newPassword: string): Promise<User> {
    const res = await request<AuthResponse>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    setTokens(res.tokens);
    return mapUser(res.user);
  },

  // ---- Tracks ----
  async getTracks(): Promise<Track[]> {
    // Backend returns { tracks: [...], count: N }
    const res = await request<{ tracks: unknown[] }>("/api/tracks");
    return (res.tracks ?? []).map(mapTrack);
  },

  async getTrack(id: string): Promise<Track> {
    const raw = await request<unknown>(`/api/tracks/${id}`);
    return mapTrack(raw);
  },

  async createTrack(data: Partial<Track>): Promise<Track> {
    const raw = await request<unknown>("/api/tracks", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return mapTrack(raw);
  },

  async updateTrack(id: string, data: Partial<Track>): Promise<Track> {
    const raw = await request<unknown>(`/api/tracks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return mapTrack(raw);
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
  async getRoutes(): Promise<Route[]> {
    // Backend returns { routes: [...], count: N }
    const res = await request<{ routes: unknown[] }>("/api/routes");
    return (res.routes ?? []).map(mapRoute);
  },

  async getRoute(id: string): Promise<Route> {
    const raw = await request<unknown>(`/api/routes/${id}`);
    return mapRoute(raw);
  },

  async createRoute(data: Partial<Route>): Promise<Route> {
    const raw = await request<unknown>("/api/routes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return mapRoute(raw);
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
  async getWaypoints(): Promise<Waypoint[]> {
    // Backend returns { waypoints: [...], count: N }
    const res = await request<{ waypoints: unknown[] }>("/api/waypoints");
    return (res.waypoints ?? []).map(mapWaypoint);
  },

  async createWaypoint(data: Partial<Waypoint>): Promise<Waypoint> {
    const raw = await request<unknown>("/api/waypoints", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return mapWaypoint(raw);
  },

  async updateWaypoint(id: string, data: Partial<Waypoint>): Promise<Waypoint> {
    const raw = await request<unknown>(`/api/waypoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return mapWaypoint(raw);
  },

  deleteWaypoint(id: string): Promise<void> {
    return request<void>(`/api/waypoints/${id}`, { method: "DELETE" });
  },
};
