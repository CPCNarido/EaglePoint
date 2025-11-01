import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
@Module({
  imports: [
    JwtModule.register({
      global: true,
      // Use environment secrets when present; fall back to a development secret to avoid
      // runtime crashes when secrets are not set. DO NOT use the fallback in production.
      secret:
        process.env.JWT_ACCESS_SECRET ??
        process.env.JWT_SECRET ??
        'dev-access-secret',
      signOptions: { expiresIn: '1h' },
    }),
    // UsersModule and EmailModule removed for minimal auth-only setup
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
