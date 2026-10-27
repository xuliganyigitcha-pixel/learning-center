import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './prisma-exception.filter';

async function bootstrap() {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret || accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET va JWT_REFRESH_SECRET kamida 32 belgidan iborat bo‘lishi kerak');
  }
  if (accessSecret === refreshSecret) {
    throw new Error('JWT access va refresh secretlar alohida bo‘lishi kerak');
  }
  const accessTtl = process.env.JWT_ACCESS_TTL || '15m';
  const accessTtlMatch = /^([1-9]\d*)(s|m|h|d)$/.exec(accessTtl);
  const refreshTtlDays = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);
  if (!accessTtlMatch || !Number.isSafeInteger(refreshTtlDays) || refreshTtlDays < 1 || refreshTtlDays > 30) {
    throw new Error('JWT token muddati sozlamalari noto‘g‘ri');
  }
  const ttlUnits: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  if (Number(accessTtlMatch[1]) * ttlUnits[accessTtlMatch[2]] > 24 * 60 * 60) {
    throw new Error('JWT_ACCESS_TTL 24 soatdan oshmasligi kerak');
  }
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit: '100kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix('api');
  await app.listen(Number(process.env.PORT || 4000));
  console.log(`Backend: ${await app.getUrl()}/api`);
}

void bootstrap();
