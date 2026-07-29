import Joi from 'joi';

const secretSchema = Joi.string().min(32).required();

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema.invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_ISSUER: Joi.string().min(3).required(),
  JWT_AUDIENCE: Joi.string().min(3).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number()
    .integer()
    .min(3600)
    .max(60 * 60 * 24 * 90)
    .default(60 * 60 * 24 * 30),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  APPLE_CLIENT_ID: Joi.string().required(),
  APPLE_TEAM_ID: Joi.string().required(),
  APPLE_KEY_ID: Joi.string().required(),
  APPLE_PRIVATE_KEY: Joi.string().min(32).required(),
  OAUTH_ALLOWED_REDIRECT_URIS: Joi.string().min(1).required(),
  CORS_ORIGINS: Joi.string().min(1).required(),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(60),
  AUTH_THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().min(1).default(5),
  ARGON2_MEMORY_COST: Joi.number().integer().min(8192).default(19456),
  ARGON2_TIME_COST: Joi.number().integer().min(2).default(2),
  ARGON2_PARALLELISM: Joi.number().integer().min(1).default(1),
  REQUIRE_MODERATION: Joi.boolean().default(true),
  CONTENT_THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  CONTENT_THROTTLE_LIMIT: Joi.number().integer().min(1).default(20),
  OXY_WSA_USERNAME: Joi.string().min(1).optional(),
  OXY_WSA_PASSWORD: Joi.string().min(1).optional(),
  OXY_WSA_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(150000)
    .default(120000),
  TRAVEL_INGESTION_THROTTLE_TTL_MS: Joi.number()
    .integer()
    .min(60000)
    .default(300000),
  TRAVEL_INGESTION_THROTTLE_LIMIT: Joi.number().integer().min(1).default(1),
  TRAVEL_INGESTION_MAX_TREND_KEYWORDS: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(10),
  TRAVEL_INGESTION_MAX_CANDIDATE_URLS: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(40),
  TRAVEL_INGESTION_MAX_POSTS: Joi.number().integer().min(1).max(50).default(20),
  TRAVEL_INGESTION_MAX_PLACES: Joi.number()
    .integer()
    .min(1)
    .max(25)
    .default(10),
  TRAVEL_INGESTION_MAX_PROVINCE_QUERIES: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  TRAVEL_INGESTION_SEARCH_PAGES: Joi.number()
    .integer()
    .min(1)
    .max(3)
    .default(2),
  TRAVEL_INGESTION_SEARCH_RESULTS_PER_PAGE: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(10),
  TRAVEL_INGESTION_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(3000),
  TRAVEL_INGESTION_LEASE_DURATION_MS: Joi.number()
    .integer()
    .min(60000)
    .max(900000)
    .default(300000),
  TRAVEL_INGESTION_HEARTBEAT_INTERVAL_MS: Joi.number()
    .integer()
    .min(5000)
    .less(Joi.ref('TRAVEL_INGESTION_LEASE_DURATION_MS'))
    .default(30000),
  TRAVEL_INGESTION_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3),
  ADMIN_EMAIL: Joi.string().email().optional(),
  ADMIN_PASSWORD: Joi.string().min(8).max(128).optional(),
  ADMIN_DISPLAY_NAME: Joi.string().min(1).max(100).optional(),
})
  .and('ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_DISPLAY_NAME')
  .and('OXY_WSA_USERNAME', 'OXY_WSA_PASSWORD');
