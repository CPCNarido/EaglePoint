import {
  CallHandler,
  ClassSerializerInterceptor,
  ExecutionContext,
  Injectable,
  PlainLiteralObject,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class RolesSerializerInterceptor extends ClassSerializerInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const userRolesRaw: string | string[] | undefined = user?.role;
    const userRoles = Array.isArray(userRolesRaw)
      ? userRolesRaw
      : userRolesRaw
        ? [userRolesRaw]
        : [];

    const contextOptions = this.getContextOptions(context) as any;
    const contextGroups: string[] = Array.isArray(contextOptions?.groups)
      ? contextOptions.groups
      : contextOptions?.groups
        ? [contextOptions.groups]
        : [];

    // merge controller/handler groups with user roles (preserve SELF if declared on controller)
    const mergedGroups = Array.from(new Set([...contextGroups, ...userRoles]));

    const options = {
      ...this.defaultOptions,
      ...contextOptions,
      ...(mergedGroups.length ? { groups: mergedGroups } : {}),
    };

    return next
      .handle()
      .pipe(
        map((res: PlainLiteralObject | PlainLiteralObject[]) =>
          this.serialize(res, options),
        ),
      );
  }
}
