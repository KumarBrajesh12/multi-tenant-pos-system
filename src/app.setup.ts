import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Global HTTP pipeline. Shared by main.ts and the e2e tests so the tests
 * exercise exactly the same validation and error handling as production.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties without decorators...
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // build DTO instances / coerce query params
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Multi-Tenant POS API')
    .setDescription(
      'Sales & inventory backend for multiple merchants (tenants) and their stores. ' +
        'Authenticate via POST /auth/login and use the returned token as a Bearer token.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
