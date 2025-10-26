import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from '../enum/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles =
      this.reflector.get<string[]>(ROLES_KEY, context.getHandler()) ??
      this.reflector.get<string[]>(ROLES_KEY, context.getClass());

    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    // dev-only logging
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`requiredRoles=${JSON.stringify(roles)}`);
      this.logger.debug(`request.user=${JSON.stringify(user)}`);
      this.logger.debug(`request.user.role=${user?.role}`);
    }

    if (!roles || roles.length === 0) return true;
    if (!user) throw new ForbiddenException('No user');

    const normalize = (v: any) =>
      v === undefined || v === null ? '' : String(v).toUpperCase();
    const requiredUpper = roles.map(normalize);
    const userRoleUpper = normalize(user.role);

    // user.role should match the payload your AuthService sets (e.g. role)
    if (userRoleUpper === normalize(Role.ADMIN)) return true;
    if (requiredUpper.includes(userRoleUpper)) return true;

    throw new ForbiddenException('Insufficient role');
  }
}
