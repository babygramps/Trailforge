import type { User, AuthTokens } from '../types';

export const mockUser: User = {
  id: 'usr_test_001',
  email: 'hiker@test.trailforge.io',
  displayName: 'Test Hiker',
};

export const mockAuthTokens: AuthTokens = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiJ1c3JfdGVzdF8wMDEiLCJlbWFpbCI6Imhpa2VyQHRlc3QudHJhaWxmb3JnZS5pbyIsImlhdCI6MTcyMTA0NDgwMCwiZXhwIjoxNzIxMDQ4NDAwfQ.' +
    'fake_signature_for_test_access',
  refresh_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiJ1c3JfdGVzdF8wMDEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTcyMTA0NDgwMCwiZXhwIjoxNzIxNjQ5NjAwfQ.' +
    'fake_signature_for_test_refresh',
};

export const mockCredentials = {
  email: 'hiker@test.trailforge.io',
  password: 'trailforge-test-2024',
};
