import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  // Load env via the shared @bachatly/config package when available.
  // Fall back to plain process.env (ConfigModule.forRoot also loads .env) so the
  // app still boots even if the shared package isn't built yet.
  try {
    const { loadEnv } = await import('@bachatly/config');
    loadEnv();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[bootstrap] @bachatly/config loadEnv() unavailable, falling back to process.env:',
      (err as Error)?.message,
    );
  }

  // rawBody: true keeps the raw request buffer for HMAC signature verification
  // on payment webhooks (see payments.controller).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  const isProd = process.env.NODE_ENV === 'production';

  // Phase 13 — security headers. CSP baseline is Swagger-UI compatible
  // (/api/docs needs inline scripts/styles); HSTS is production-only so
  // plain-HTTP local dev is never affected.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'], // Swagger UI
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Swagger UI compatibility
      hsts: isProd ? undefined : false, // HSTS in production only
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // X-Content-Type-Options: nosniff and X-Frame-Options: SAMEORIGIN
      // come from helmet defaults.
    }),
  );
  app.use(cookieParser());

  // Phase 13 — weak ETags on responses so clients/proxies can revalidate
  // heavy GETs (deal lists, categories, locations) with If-None-Match → 304.
  app.set('etag', 'weak');

  // Serve local dev uploads (LocalStorageService). In production the
  // S3-compatible implementation serves files from the bucket/CDN instead.
  if (!process.env.S3_ENDPOINT) {
    app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'), {
      prefix: '/uploads/',
    });
  }

  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
  });

  // All routes live under /api/v1 (URI versioning, default version "1").
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bachatly API')
    .setDescription('Bachatly — Save More. Live More. Deals, memberships & redemptions API.')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Served at /api/docs (global prefix applies to the 'docs' path).
  SwaggerModule.setup('docs', app, document);

  const port = parseInt(process.env.PORT || '4000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] bachatly-api listening on :${port} (prefix /api/v1, docs /api/docs)`);
}

void bootstrap();
