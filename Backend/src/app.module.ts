import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Note: TypeORM is intentionally not initialized here in dev to avoid
    // TLS/self-signed cert issues with the managed DB. DbService (pg client)
    // is used for direct queries. If you need TypeORM, configure proper CA
    // or enable it with secure settings in production.
    DbModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
