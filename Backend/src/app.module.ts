import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// Removed unused modules - only Auth and Prisma remain for minimal auth flow
import { AuthModule } from './modules/auth/auth.module';
// import { LostFoundModule } from './modules/lost-found/lost-found.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { DispatcherModule } from './modules/dispatcher/dispatcher.module';
// import { BusinessModule } from './modules/business/business.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AdminModule,
    DispatcherModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Roles serializer interceptor removed for minimal auth-only setup
  ],
})
export class AppModule {}
