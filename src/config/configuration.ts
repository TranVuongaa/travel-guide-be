function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

export default () => ({
  port: parseInteger(process.env.PORT, 3000),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  throttle: {
    ttlMs: parseInteger(process.env.THROTTLE_TTL_MS, 60000),
    limit: parseInteger(process.env.THROTTLE_LIMIT, 60),
    authTtlMs: parseInteger(process.env.AUTH_THROTTLE_TTL_MS, 60000),
    authLimit: parseInteger(process.env.AUTH_THROTTLE_LIMIT, 5),
  },
  auth: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtIssuer: process.env.JWT_ISSUER,
    jwtAudience: process.env.JWT_AUDIENCE,
    accessTtlSeconds: parseInteger(process.env.JWT_ACCESS_TTL_SECONDS, 900),
    refreshTtlSeconds: parseInteger(
      process.env.JWT_REFRESH_TTL_SECONDS,
      2592000,
    ),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    appleClientId: process.env.APPLE_CLIENT_ID,
    appleTeamId: process.env.APPLE_TEAM_ID,
    appleKeyId: process.env.APPLE_KEY_ID,
    applePrivateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    oauthAllowedRedirectUris: parseCsv(process.env.OAUTH_ALLOWED_REDIRECT_URIS),
    argon2: {
      memoryCost: parseInteger(process.env.ARGON2_MEMORY_COST, 19456),
      timeCost: parseInteger(process.env.ARGON2_TIME_COST, 2),
      parallelism: parseInteger(process.env.ARGON2_PARALLELISM, 1),
    },
  },
  content: {
    requireModeration: parseBoolean(process.env.REQUIRE_MODERATION, true),
    throttleTtlMs: parseInteger(process.env.CONTENT_THROTTLE_TTL_MS, 60000),
    throttleLimit: parseInteger(process.env.CONTENT_THROTTLE_LIMIT, 20),
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInteger(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
  },
});
