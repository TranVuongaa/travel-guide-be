process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/travel_guide_test';
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-that-is-different-and-long-enough';
process.env.JWT_ISSUER = 'travel-guide-test';
process.env.JWT_AUDIENCE = 'travel-guide-test-clients';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_SECONDS = '2592000';
process.env.GOOGLE_CLIENT_ID = 'google-test-client';
process.env.GOOGLE_CLIENT_SECRET = 'google-test-client-secret';
process.env.APPLE_CLIENT_ID = 'apple.test.client';
process.env.APPLE_TEAM_ID = 'APPLE_TEAM';
process.env.APPLE_KEY_ID = 'APPLE_KEY';
process.env.APPLE_PRIVATE_KEY =
  '-----BEGIN PRIVATE KEY-----\\ntest-private-key-material-long-enough\\n-----END PRIVATE KEY-----';
process.env.OAUTH_ALLOWED_REDIRECT_URIS = 'https://client.test/oauth/callback';
process.env.CORS_ORIGINS = 'https://client.test';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';
process.env.AUTH_THROTTLE_TTL_MS = '60000';
process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.ARGON2_MEMORY_COST = '8192';
process.env.ARGON2_TIME_COST = '2';
process.env.ARGON2_PARALLELISM = '1';
