import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Tizimga kiring');

    try {
      request.user = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }
    if (!request.user.sid) throw new UnauthorizedException('Sessiya yaroqsiz');
    const session = await this.prisma.session.findFirst({
      where: {
        id: request.user.sid,
        userId: request.user.sub,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: { id: true, role: true, login: true, isActive: true, mustChangePw: true },
        },
      },
    });
    const user = session?.user;
    if (!user?.isActive) throw new UnauthorizedException('Hisob faol emas');
    request.user = {
      sub: user.id,
      role: user.role,
      login: user.login,
      mustChangePw: user.mustChangePw,
    };
    if (
      request.user.mustChangePw &&
      !['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'].includes(request.path)
    ) {
      throw new ForbiddenException('Davom etishdan oldin parolingizni o‘zgartiring');
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Ruxsat yo‘q');
    return true;
  }
}
