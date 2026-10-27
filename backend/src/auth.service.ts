import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(login: string, password: string, ip: string, userAgent: string) {
    const normalizedLogin = login.trim().toLowerCase();
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const failures = await this.prisma.loginAttempt.count({
      where: { login: normalizedLogin, ip, success: false, createdAt: { gte: since } },
    });
    if (failures >= 5) throw new UnauthorizedException('15 daqiqadan so‘ng qayta urinib ko‘ring');

    const user = await this.prisma.user.findUnique({ where: { login: normalizedLogin } });
    const valid = Boolean(
      user && user.isActive && (await bcrypt.compare(password, user.passwordHash)),
    );
    await this.prisma.loginAttempt.create({
      data: { login: normalizedLogin, ip, success: valid },
    });
    await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    if (!valid || !user) throw new UnauthorizedException('Login yoki parol xato');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const session = await this.createSession(user.id, ip, userAgent);
    return {
      accessToken: this.accessToken(user, session.id),
      refreshToken: session.token,
      user: this.publicUser(user),
    };
  }

  async refresh(token: string | undefined, ip: string, userAgent: string) {
    if (!token) throw new UnauthorizedException('Refresh token topilmadi');
    let payload: { sub: string; jti: string; type: string };
    try {
      payload = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.jti } });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt <= new Date() ||
      !(await bcrypt.compare(token, session.refreshTokenHash))
    ) {
      throw new UnauthorizedException('Sessiya topilmadi');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isActive) throw new UnauthorizedException('Hisob faol emas');

    await this.prisma.session.delete({ where: { id: session.id } });
    const nextSession = await this.createSession(user.id, ip, userAgent);
    return {
      accessToken: this.accessToken(user, nextSession.id),
      refreshToken: nextSession.token,
    };
  }

  async logout(token?: string) {
    if (token) {
      try {
        const payload = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET });
        if (payload.jti) await this.prisma.session.deleteMany({ where: { id: payload.jti } });
      } catch {
        // Expired or malformed tokens are already unusable.
      }
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
      throw new BadRequestException('Eski parol xato');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePw: false },
      }),
      this.prisma.session.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }

  private accessToken(
    user: { id: string; role: string; login: string; mustChangePw: boolean },
    sessionId: string,
  ) {
    return this.jwt.sign(
      {
        sub: user.id,
        sid: sessionId,
        role: user.role,
        login: user.login,
        mustChangePw: user.mustChangePw,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: accessTokenLifetime(),
      },
    );
  }

  private async createSession(userId: string, ip: string, userAgent: string) {
    const sessionId = randomUUID();
    const days = Math.min(Math.max(Number(process.env.JWT_REFRESH_TTL_DAYS || 7), 1), 30);
    const token = this.jwt.sign(
      { sub: userId, jti: sessionId, type: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: days * 24 * 60 * 60 },
    );
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: await bcrypt.hash(token, 10),
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { id: sessionId, token };
  }

  private publicUser(user: {
    id: string;
    login: string;
    fullName: string;
    role: string;
    phone: string | null;
    mustChangePw: boolean;
  }) {
    return {
      id: user.id,
      login: user.login,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      mustChangePw: user.mustChangePw,
    };
  }
}

function accessTokenLifetime(): number {
  const configured = process.env.JWT_ACCESS_TTL || '15m';
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(configured);
  if (!match) throw new Error('JWT_ACCESS_TTL formati noto‘g‘ri');
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * units[match[2]];
}
