import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: Record<string, unknown> }>();
    const user = req.user;
    if (!user) return undefined;
    if (data) return user[data];
    return user;
  },
);
