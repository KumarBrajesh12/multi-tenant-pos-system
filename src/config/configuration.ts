// env is already validated by envValidationSchema at this point
export const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    logging: process.env.DB_LOGGING === 'true',
    runMigrations: process.env.DB_RUN_MIGRATIONS === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  invitations: {
    ttlHours: Number(process.env.INVITATION_TTL_HOURS ?? 168),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 60),
  },
  payments: {
    provider: process.env.PAYMENT_PROVIDER ?? 'mock',
    timeoutMs: Number(process.env.PAYMENT_TIMEOUT_MS ?? 5000),
    mockLatencyMs: Number(process.env.MOCK_PAYMENT_LATENCY_MS ?? 0),
  },
  sales: {
    reconcileAfterSeconds: Number(process.env.SALE_RECONCILE_AFTER_SECONDS ?? 120),
    reconcileEnabled: process.env.SALE_RECONCILE_ENABLED !== 'false',
  },
});

export type AppConfig = ReturnType<typeof configuration>;

// .env.<NODE_ENV> takes priority over .env
export const envFilePaths = (): string[] => {
  const env = process.env.NODE_ENV ?? 'development';
  return [`.env.${env}`, '.env'];
};
