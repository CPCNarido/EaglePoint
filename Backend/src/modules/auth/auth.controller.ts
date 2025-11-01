import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { User } from '../../common/decorator/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.signIn(body.email, body.password);

    // Determine destination by role
    const role = (tokens as any).role as string | undefined;
    let destination = '/(main)/admin/admin';
    switch (role) {
      case 'Admin':
        destination = '/(main)/admin/admin';
        break;
      case 'Cashier':
        destination = '/(main)/cashier/cashier';
        break;
      case 'Dispatcher':
        destination = '/(main)/dispatcher/dispatcher';
        break;
      case 'BallHandler':
        destination = '/(main)/ballhandler/ballhandler';
        break;
      default:
        destination = '/';
    }

    // Set refresh token as HttpOnly cookie (best-effort)
    try {
      const secure = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });
    } catch (e) {
      void e;
    }

    // Also return refreshToken in body so native clients can store it securely.
    // We still set the HttpOnly cookie for web clients.
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      destination,
    };
  }

  @Post('refresh')
  async refreshByToken(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Accept refresh token in body (mobile) or cookie (web) and return new tokens.
    let token = body?.refreshToken;
    if (!token) {
      try {
        const cookieHeader = req.headers?.cookie || '';
        const match = cookieHeader
          .split(';')
          .map((s) => s.trim())
          .find((c) => c.startsWith('refreshToken='));
        if (match) token = decodeURIComponent(match.split('=')[1] || '');
      } catch (e) {
        void e;
      }
    }

    if (!token) throw new UnauthorizedException('Missing refresh token');

    const tokens = await this.authService.refreshWithToken(token);

    // Set refresh cookie for web flows
    try {
      const secure = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } catch (e) {
      void e;
    }

    // Return access + refresh tokens in body so mobile clients can store the refresh token.
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @UseGuards(AuthGuard)
  @Post('token')
  refresh(@Body() body: { refreshToken: string }, @User('sub') userId: number) {
    return this.authService.refreshTokens(userId, body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string },
    @User('sub') userId: number,
  ) {
    // Prefer body refreshToken, fall back to cookie if present
    let token = body?.refreshToken;
    if (!token) {
      try {
        const cookieHeader = req.headers?.cookie || '';
        // simple cookie parse
        const match = cookieHeader
          .split(';')
          .map((s) => s.trim())
          .find((c) => c.startsWith('refreshToken='));
        if (match) {
          token = decodeURIComponent(match.split('=')[1] || '');
        }
      } catch (e) {
        void e;
      }
    }

    try {
      this.authService.revokeRefreshToken(userId, token);
    } catch (e) {
      void e;
    }

    // Clear cookie
    try {
      res.clearCookie('refreshToken', { path: '/' });
    } catch (e) {
      void e;
    }

    return { ok: true };
  }
}
