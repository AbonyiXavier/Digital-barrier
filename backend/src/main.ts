import compression from 'compression';
import { json } from 'express';
import helmet from 'helmet';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfigService } from './config';

const AUTH_PREFIX = '/api/auth';

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');

  // Better Auth reads the raw request body itself, so Nest's parser must be off.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // ...which means we put JSON parsing back for everything that is not auth.
  app.use((req: { originalUrl?: string }, res: unknown, next: () => void) => {
    if (req.originalUrl?.startsWith(AUTH_PREFIX)) return next();
    return json({ limit: '1mb' })(req as never, res as never, next);
  });

  const config = app.get(AppConfigService);

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Finish in-flight work on SIGTERM instead of dropping it.
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Aegis API')
        .setDescription(
          'Content blocking, protection locks and accountability. ' +
            'No endpoint returns or stores a visited domain: blocked activity is a daily count.',
        )
        .setVersion('0.1.0')
        .addCookieAuth('better-auth.session_token')
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/json',
    });
  }

  await app.listen(config.port);
  logger.log(`listening on :${config.port} (${config.nodeEnv})`);
  if (!config.isProduction) logger.log(`docs at http://localhost:${config.port}/docs`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('bootstrap');
  const code = (error as NodeJS.ErrnoException).code;

  if (code === 'EADDRINUSE') {
    // Much the most common way this fails locally, and a raw stack trace buries
    // the one thing you need to know.
    const port = process.env.PORT ?? '3001';
    logger.error(`Port ${port} is already in use — something else is serving there.`);
    logger.error(`  see what:  lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    logger.error(`  free it:   kill $(lsof -nP -tiTCP:${port} -sTCP:LISTEN)`);
    logger.error(`  or:        PORT=3001 npm run start:dev`);
    process.exit(1);
  }

  if (code === 'ECONNREFUSED') {
    logger.error('A dependency refused the connection. Is Postgres or Redis running?');
    logger.error('  brew services list');
    process.exit(1);
  }

  logger.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack !== undefined) logger.error(error.stack);
  process.exit(1);
});
