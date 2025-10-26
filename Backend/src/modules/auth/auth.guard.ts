import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const header = req.headers.authorization;
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`Authorization header present=${!!header}`);
    }
    if (!header) throw new UnauthorizedException();

    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();

    try {
      // use the same access secret your AuthService signs with
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`jwt payload=${JSON.stringify(payload)}`);
      }
      // attach user payload to request for downstream guards/controllers
      req['user'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
