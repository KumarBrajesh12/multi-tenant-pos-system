import * as Joi from 'joi';

/**
 * Validates process.env at startup. The app refuses to boot with a missing or
 * malformed variable instead of failing later at the first request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_RUN_MIGRATIONS: Joi.boolean().default(false),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  CACHE_ENABLED: Joi.boolean().default(true),
  CACHE_TTL_SECONDS: Joi.number().integer().min(1).max(86400).default(60),

  PAYMENT_PROVIDER: Joi.string().valid('mock').default('mock'),
  PAYMENT_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),
  MOCK_PAYMENT_LATENCY_MS: Joi.number().integer().min(0).default(0),
  SALE_RECONCILE_AFTER_SECONDS: Joi.number().integer().min(10).default(120),
  SALE_RECONCILE_ENABLED: Joi.boolean().default(true),
});
