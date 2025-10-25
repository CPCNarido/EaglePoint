import { Controller, Get, Post, Body, UnauthorizedException, Req } from '@nestjs/common';
import { AppService } from './app.service';
import type { Request } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('login')
  async login(@Req() req: Request, @Body() body: { email?: string; password?: string }) {
    const email = body.email ?? '';
    const password = body.password ?? '';
    const ok = await this.appService.validateUser(email, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Log successful login (do not log password)
    console.log(`[Auth] login success for="${email}"`);
    // return user info including role so frontend can route accordingly
    const user = await this.appService.getUserByIdentifier(email);
    const role = user?.role ?? 'admin';
    let destination = '/admin';
    if (role === 'dispatcher') destination = '/dispatcher';
    if (role === 'cashier') destination = '/cashier';
    if (role === 'ballhandler') destination = '/ballhandler';
    // store minimal user info in session
    (req as any).session = (req as any).session || {};
    (req as any).session.user = { id: user?.id, username: user?.username, role };

    return { message: 'Authenticated', user: { id: user?.id, username: user?.username, role }, destination };
  }

  @Get('me')
  getMe(@Req() req: Request) {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) throw new UnauthorizedException('Not authenticated');
    return { user: sessionUser };
  }
}