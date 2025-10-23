import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import session from 'express-session';

// Development helper: allow connecting to DBs with self-signed certs when explicitly enabled.
if (process.env.DEV_ALLOW_SELF_SIGNED_TLS === '1') {
  // eslint-disable-next-line no-process-env
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Trust proxy if you run behind one (adjust for your env)
  // Cast to any to access underlying Express methods
  (app as any).set('trust proxy', 1);

  // Session middleware (development: MemoryStore). Replace store for production.
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // set true if using https in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      },
    }),
  );

  // Enable CORS for development and allow credentials (cookies)
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
