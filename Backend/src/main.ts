declare const module: any;

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Enable CORS for development so web (expo/react-native-web) can call the API
  // Allow credentials so HttpOnly refresh cookie can be set from the server.
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }

  // Default to port 3000 for local development to match common setups.
  // Serve uploaded assets (uploads/) as static so files saved at runtime are accessible
  // from e.g. http://localhost:3000/uploads/<filename>
  try {
    const uploadsPath = join(__dirname, '..', 'uploads');
    try {
      if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
    } catch (e) {
      // ignore
    }
    app.use('/uploads', express.static(uploadsPath));
  } catch (e) {
    // best-effort; if static middleware cannot be registered, continue without failing
    // (some environments may not permit filesystem writes)
    // eslint-disable-next-line no-console
    console.warn('Failed to register uploads static', e);
  }
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
