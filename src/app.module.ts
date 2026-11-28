import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AccessModule } from './access/access.module';
import { AppController } from './app.controller';
import { TenantGuard } from './access/tenant.guard';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CacheModule } from './cache/cache.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { configuration, envFilePaths } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { MembersModule } from './members/members.module';
import { MerchantsModule } from './merchants/merchants.module';
import { PlatformModule } from './platform/platform.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths(),
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CacheModule,
    AccessModule,
    AuthModule,
    HealthModule,
    MerchantsModule,
    StoresModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    MembersModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    // order matters: authenticate first, then check tenant access
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: TenantGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '{*path}' (not '*path') so the root path "/" is included as well
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
