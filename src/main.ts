import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ReviewExceptionFilter } from './common/filters/http-exception.filter';
import { createLogger } from './observability/logging/logger';

async function bootstrap(): Promise<void> {
  const logger = createLogger();
  const app = await NestFactory.create(AppModule, { logger, bufferLogs: true });

  // Global prefix — health endpoints excluded per API spec
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  // Strip unknown fields and coerce types — security baseline
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Standardised error envelope: {error:{code,message,details,trace_id}}
  app.useGlobalFilters(new ReviewExceptionFilter());

  // Request-ID propagation (read X-Request-ID or generate UUIDv7)
  app.use(RequestIdMiddleware);

  // Graceful shutdown on SIGTERM/SIGINT
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Rating-Comment Service listening on :${port}`, 'Bootstrap');
}

void bootstrap();
