import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { TenantDb } from './tenant-db';
import { buildTypeOrmOptions } from './typeorm.options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        ...buildTypeOrmOptions(config.get('database', { infer: true })),
        autoLoadEntities: true,
      }),
    }),
  ],
  providers: [TenantDb],
  exports: [TenantDb],
})
export class DatabaseModule {}
