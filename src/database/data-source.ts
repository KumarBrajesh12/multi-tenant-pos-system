import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { configuration, envFilePaths } from '../config/configuration';
import { buildTypeOrmOptions } from './typeorm.options';

// DataSource for the TypeORM CLI and the seed script (same env files as the app)
for (const path of envFilePaths()) {
  dotenv.config({ path });
}

const AppDataSource = new DataSource(buildTypeOrmOptions(configuration().database));

export default AppDataSource;
