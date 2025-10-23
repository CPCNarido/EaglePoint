import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        return {
          type: 'postgres',
          url,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          ssl: { rejectUnauthorized: false },
          extra: { ssl: { rejectUnauthorized: false } },
        } as any;
      },
    }),
    DbModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
