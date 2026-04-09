import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient, ApiError } from '../api/client';

const mockTokens = {
  access_token: 'test-access-token-fresh',
  refresh_token: 'test-refresh-token-fresh',
};

const mockUserApi = {
  id: 'user-123',
  email: 'auth@test.trailforge.io',
  display_name: 'Auth Tester',
};

const server = setupServer(
  http.post('/api/auth/register', () => {
    return HttpResponse.json({ user: mockUserApi, tokens: mockTokens });
  }),
  http.post('/api/auth/login', () => {
    return HttpResponse.json({ user: mockUserApi, tokens: mockTokens });
  }),
  http.post('/api/auth/refresh', () => {
    return HttpResponse.json({
      access_token: 'refreshed-access-token',
      refresh_token: 'refreshed-refresh-token',
    });
  }),
  http.get('/api/tracks', ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'unauthorized' }, { status: 401 });
    }
    return HttpResponse.json([]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  apiClient.logout();
});
afterAll(() => server.close());

describe('Auth Flow Integration', () => {
  it('starts unauthenticated', () => {
    expect(apiClient.isAuthenticated()).toBe(false);
  });

  it('register stores tokens and authenticates', async () => {
    const user = await apiClient.register('auth@test.trailforge.io', 'password123', 'Auth Tester');
    expect(apiClient.isAuthenticated()).toBe(true);
    expect(user.email).toBe('auth@test.trailforge.io');
  });

  it('logout clears authentication', async () => {
    await apiClient.register('auth@test.trailforge.io', 'password123', 'Auth Tester');
    expect(apiClient.isAuthenticated()).toBe(true);

    apiClient.logout();
    expect(apiClient.isAuthenticated()).toBe(false);
  });

  it('authenticated requests include Bearer token', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get('/api/tracks', ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json([]);
      }),
    );

    await apiClient.register('auth@test.trailforge.io', 'password123', 'Auth Tester');
    await apiClient.getTracks();
    expect(capturedAuth).toContain('Bearer');
  });

  it('401 triggers token refresh automatically', async () => {
    let refreshCalled = false;
    let requestCount = 0;

    server.use(
      http.get('/api/tracks', () => {
        requestCount++;
        if (requestCount === 1) {
          return HttpResponse.json({ message: 'expired' }, { status: 401 });
        }
        return HttpResponse.json([]);
      }),
      http.post('/api/auth/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        });
      }),
    );

    await apiClient.register('auth@test.trailforge.io', 'password123', 'Auth Tester');
    const tracks = await apiClient.getTracks();

    expect(refreshCalled).toBe(true);
    expect(tracks).toEqual([]);
    expect(requestCount).toBe(2);
  });

  it('failed refresh clears authentication', async () => {
    server.use(
      http.get('/api/tracks', () => {
        return HttpResponse.json({ message: 'expired' }, { status: 401 });
      }),
      http.post('/api/auth/refresh', () => {
        return HttpResponse.json({ message: 'invalid' }, { status: 401 });
      }),
    );

    await apiClient.register('auth@test.trailforge.io', 'password123', 'Auth Tester');
    expect(apiClient.isAuthenticated()).toBe(true);

    await expect(apiClient.getTracks()).rejects.toThrow();
    expect(apiClient.isAuthenticated()).toBe(false);
  });
});
