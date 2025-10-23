import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS for development. Allow any origin (origin: true) so Expo/web or emulator can call the API.
  // For production, replace with an explicit origin array or function.
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
