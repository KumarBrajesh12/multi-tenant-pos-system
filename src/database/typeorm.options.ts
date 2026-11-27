import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/configuration';

// Used by both the Nest app and the CLI/seed data source.
// Schema changes only go through migrations, so synchronize stays off.
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
  extra: { max: 20 },
});
