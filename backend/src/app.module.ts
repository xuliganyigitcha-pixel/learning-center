import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController, AppController } from './app.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaService } from './prisma.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AppController],
  providers: [
    PrismaService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
