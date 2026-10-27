import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, concatMap, of } from 'rxjs';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const shouldAudit = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && request.user;
    if (!shouldAudit) return next.handle();

    return next.handle().pipe(
      concatMap(async (response: { id?: string } | null) => {
        const route = request.route?.path || request.path;
        const segments = String(route).split('/').filter(Boolean);
        const entityType = segments[0] || 'unknown';
        const details = request.method === 'DELETE'
          ? null
          : JSON.stringify(sanitize(request.body || {}));
        await this.prisma.auditLog.create({
          data: {
            userId: request.user.sub,
            action: request.method,
            entityType,
            entityId: response?.id || request.params?.id || null,
            details,
            ip: request.ip,
          },
        });
        return response;
      }),
    );
  }
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /password|token|secret|authorization/i.test(key) ? '[redacted]' : sanitize(item),
    ]),
  );
}
