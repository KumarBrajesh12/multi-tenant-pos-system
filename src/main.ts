import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  configureApp(app);
  if (config.get('swaggerEnabled', { infer: true })) {
    setupSwagger(app);
  }

  const port = config.get('port', { infer: true });
  await app.listen(port);
  Logger.log(`POS API listening on port ${port} (${config.get('env', { infer: true })})`, 'Bootstrap');
}

void bootstrap();
