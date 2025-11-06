import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Validate credentials against Employee.username (login field) and password
  async validateUser(login: string, password: string) {
    // Using Employee model as the user table in this schema.
    // Accept either username or numeric employee_id (frontend allows EmployeeID or Username).
    let user = await this.prisma.employee.findUnique({
      where: { username: login },
    });
    if (!user) {
      // If login looks like an integer, try employee_id lookup
      const maybeId = parseInt(login, 10);
      if (!Number.isNaN(maybeId)) {
        user = await this.prisma.employee.findUnique({
          where: { employee_id: maybeId },
        });
      }
    }
    if (user) {
      const matches = await bcrypt.compare(password, user.password || '');
      if (matches) {
        // return the raw user object (contains employee_id and role)
        return user;
      }
    }
  }

  // Generate stateless access + refresh JWTs (no DB persistence in minimal setup)
  generateTokens(userId: number, role: string) {
    const payload = { sub: userId, role };

    const accessSecret =
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      process.env.JWT_ACCESS_SECRET ??
      process.env.JWT_SECRET ??
      'dev-access-secret';
    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      process.env.JWT_REFRESH_SECRET ??
      process.env.JWT_SECRET ??
      'dev-refresh-secret';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: '7d',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  // Verify incoming refresh token and issue new tokens if valid
  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.prisma.employee.findUnique({
      where: { employee_id: userId },
    });
    if (!user) throw new UnauthorizedException('User not found');

    try {
      const refreshSecret =
        this.config.get<string>('JWT_REFRESH_SECRET') ??
        process.env.JWT_REFRESH_SECRET ??
        process.env.JWT_SECRET ??
        'dev-refresh-secret';
      const payload = this.jwtService.verify<{ sub: number; role: string }>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
      if (!payload || payload.sub !== userId) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } catch (err) {
      void err;
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { accessToken, refreshToken: newRefresh } = this.generateTokens(
      userId,
      user.role as unknown as string,
    );
    return { accessToken, refreshToken: newRefresh };
  }

  // Verify a refresh token directly (no access token required) and return new tokens.
  async refreshWithToken(refreshToken: string) {
    try {
      const refreshSecret =
        this.config.get<string>('JWT_REFRESH_SECRET') ??
        process.env.JWT_REFRESH_SECRET ??
        process.env.JWT_SECRET ??
        'dev-refresh-secret';
      const payload = this.jwtService.verify<{ sub: number; role: string }>(
        refreshToken,
        { secret: refreshSecret },
      );
      if (!payload || !payload.sub)
        throw new UnauthorizedException('Invalid refresh token');
      const userId = payload.sub;
      const user = await this.prisma.employee.findUnique({
        where: { employee_id: userId },
      });
      if (!user) throw new UnauthorizedException('User not found');

      const tokens = this.generateTokens(
        userId,
        user.role as unknown as string,
      );
      return tokens;
    } catch (err) {
      void err;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async signIn(
    login: string,
    password: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    role: string;
    userId: number;
    user: { employee_id: number; full_name: string; username?: string | null; role: string };
  }> {
    const user = await this.validateUser(login, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.generateTokens(
      user.employee_id,
      user.role as unknown as string,
    );
    // Best-effort audit log for sign-in (avoid DI in tests by writing directly)
    try {
      await this.prisma.systemLog.create({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        data: {
          employee_id: user.employee_id,
          role: user.role as any,
          action: 'SignIn',
        } as any,
      });
    } catch (e) {
      void e;
    }
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: user.role as unknown as string,
      userId: user.employee_id,
      user: {
        employee_id: user.employee_id,
        full_name: user.full_name,
        username: user.username,
        role: user.role as unknown as string,
      },
    };
  }

  // Return a minimal public profile for the given user id
  async getUserProfile(userId: number) {
    const user = await this.prisma.employee.findUnique({
      where: { employee_id: userId },
      select: {
        employee_id: true,
        full_name: true,
        username: true,
        role: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  // Minimal revoke: stateless setup can't reliably revoke issued JWTs without DB; treat as idempotent
  revokeRefreshToken(userId: number, refreshToken?: string) {
    void userId;
    void refreshToken;
    return { ok: true };
  }
}
