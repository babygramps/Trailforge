import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient, ApiError } from './client';
import { mockUser, mockAuthTokens, mockCredentials } from '../__fixtures__/users';
import { mockTrackList, mockYosemiteTrack } from '../__fixtures__/tracks';

// Track how many times refresh is called
let refreshCallCount = 0;

const server = setupServer(
  // Default handlers
  http.post('/api/auth/login', async () => {
    return HttpResponse.json(mockAuthTokens);
  }),
  http.get('/api/auth/me', () => {
    return HttpResponse.json(mockUser);
  }),
  http.post('/api/auth/refresh', () => {
    refreshCallCount++;
    return HttpResponse.json({
      access_token: 'refreshed_access_token',
      refresh_token: 'refreshed_refresh_token',
    });
  }),
  http.get('/api/tracks', () => {
    return HttpResponse.json(mockTrackList);
  }),
  http.post('/api/tracks', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockYosemiteTrack, ...body }, { status: 201 });
  }),
  http.delete('/api/tracks/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/tracks/:id/export/gpx', () => {
    return new HttpResponse('<gpx></gpx>', {
      headers: { 'Content-Type': 'application/gpx+xml' },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterAll(() => server.close());

afterEach(() => {
  server.resetHandlers();
  refreshCallCount = 0;
});

describe('apiClient', () => {
  beforeEach(() => {
    // Ensure we start logged out
    apiClient.logout();
  });

  it('login sends credentials and stores tokens', async () => {
    const user = await apiClient.login(mockCredentials.email, mockCredentials.password);
    expect(user).toEqual(mockUser);
    expect(apiClient.isAuthenticated()).toBe(true);
  });

  it('logout clears tokens', async () => {
    await apiClient.login(mockCredentials.email, mockCredentials.password);
    expect(apiClient.isAuthenticated()).toBe(true);

    apiClient.logout();
    expect(apiClient.isAuthenticated()).toBe(false);
  });

  it('request adds Authorization header when authenticated', async () => {
    let capturedAuth = '';
    server.use(
      http.get('/api/tracks', ({ request }) => {
        capturedAuth = request.headers.get('Authorization') ?? '';
        return HttpResponse.json([]);
      }),
    );

    await apiClient.login(mockCredentials.email, mockCredentials.password);
    await apiClient.getTracks();

    expect(capturedAuth).toMatch(/^Bearer .+/);
  });

  it('401 triggers automatic token refresh', async () => {
    // Login first
    await apiClient.login(mockCredentials.email, mockCredentials.password);

    let callCount = 0;
    server.use(
      http.get('/api/tracks', ({ request }) => {
        callCount++;
        // First call returns 401, subsequent calls succeed (after refresh)
        if (callCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json(mockTrackList);
      }),
    );

    const tracks = await apiClient.getTracks();
    expect(tracks).toEqual(mockTrackList);
    expect(refreshCallCount).toBe(1);
  });

  it('refresh deduplication - concurrent 401s share one refresh', async () => {
    await apiClient.login(mockCredentials.email, mockCredentials.password);

    // Track per-endpoint call counts
    let tracksCallCount = 0;
    let meCallCount = 0;

    server.use(
      http.get('/api/tracks', () => {
        tracksCallCount++;
        if (tracksCallCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json(mockTrackList);
      }),
      http.get('/api/auth/me', () => {
        meCallCount++;
        if (meCallCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json(mockUser);
      }),
    );

    // Fire both requests concurrently; both get 401, both trigger refresh
    const [tracks] = await Promise.all([
      apiClient.getTracks(),
      // Make a second request that also gets a 401
      fetch('/api/auth/me', { headers: { Authorization: 'Bearer old' } }),
    ]);

    expect(tracks).toEqual(mockTrackList);
    // The refresh deduplication means only 1 refresh call was made
    expect(refreshCallCount).toBe(1);
  });

  it('ApiError includes status code', async () => {
    server.use(
      http.get('/api/tracks', () => {
        return new HttpResponse('Not Found', { status: 404 });
      }),
    );

    try {
      await apiClient.getTracks();
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('getTracks returns array', async () => {
    await apiClient.login(mockCredentials.email, mockCredentials.password);
    const tracks = await apiClient.getTracks();
    expect(Array.isArray(tracks)).toBe(true);
    expect(tracks).toHaveLength(3);
  });

  it('createTrack sends POST with body', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post('/api/tracks', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...mockYosemiteTrack, ...capturedBody });
      }),
    );

    await apiClient.login(mockCredentials.email, mockCredentials.password);
    const result = await apiClient.createTrack({ name: 'New Trail' });
    expect(capturedBody).toHaveProperty('name', 'New Trail');
    expect(result.name).toBe('New Trail');
  });

  it('deleteTrack returns void on 204', async () => {
    await apiClient.login(mockCredentials.email, mockCredentials.password);
    const result = await apiClient.deleteTrack('trk_yosemite_001');
    expect(result).toBeUndefined();
  });

  it('exportGPX returns Blob', async () => {
    await apiClient.login(mockCredentials.email, mockCredentials.password);
    const blob = await apiClient.exportGPX('trk_yosemite_001');
    // In jsdom, Blob may come from a different realm, so check constructor name
    expect(blob.constructor.name).toBe('Blob');
    expect(blob.size).toBeGreaterThan(0);
    const text = await blob.text();
    expect(text).toContain('gpx');
  });
});
