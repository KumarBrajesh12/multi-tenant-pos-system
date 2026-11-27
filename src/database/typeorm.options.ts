import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/configuration';

/**
 * Single source of truth for TypeORM options, shared by the Nest app
 * (DatabaseModule) and the TypeORM CLI / seed script (data-source.ts).
 *
 * `synchronize` is always false: the schema is owned by the committed
 * migrations, never by entity metadata.
 */
export const buildTypeOrmOptions = (db: AppConfig['database']): DataSourceOptions => ({
  type: 'postgres',
  host: db.host,
  port: db.port,
  username: db.username,
  password: db.password,
  database: db.name,
  ssl: db.ssl ? { rejectUnauthorized: false } : false,
  logging: db.logging,
  synchronize: false,
  migrationsRun: db.runMigrations,
  migrationsTableName: 'schema_migrations',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  extra: {
    // pg pool size; sale creation uses short transactions so this is plenty for a demo
    max: 20,
  },
});
