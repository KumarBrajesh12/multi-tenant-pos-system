import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { configuration, envFilePaths } from '../config/configuration';
import { buildTypeOrmOptions } from './typeorm.options';

/**
 * Standalone DataSource used by the TypeORM CLI (migrations) and the seed
 * script. Loads the same env files as the Nest app, in the same precedence.
 */
for (const path of envFilePaths()) {
  dotenv.config({ path });
}

const AppDataSource = new DataSource(buildTypeOrmOptions(configuration().database));

export default AppDataSource;
