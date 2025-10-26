import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// Removed unused modules - only Auth and Prisma remain for minimal auth flow
import { AuthModule } from './modules/auth/auth.module';
// import { LostFoundModule } from './modules/lost-found/lost-found.module';
import { PrismaModule } from './common/prisma/prisma.module';
// import { ContentsModule } from './modules/contents/contents.module';
// import { NotificationsModule } from './modules/notifications/notifications.module';
// import { RolesSerializerInterceptor } from 'common/decorator/roles-serializer.interceptor';
// import { MeModule } from './modules/me/me.module';
// import { EmailModule } from './modules/email/email.module';
import { ConfigModule } from '@nestjs/config';
// import { BusinessModule } from './modules/business/business.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Roles serializer interceptor removed for minimal auth-only setup
  ],
})
export class AppModule {}
