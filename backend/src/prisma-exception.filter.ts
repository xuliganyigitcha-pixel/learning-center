import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const knownErrors: Record<string, { status: HttpStatus; message: string }> = {
      P2002: { status: HttpStatus.CONFLICT, message: 'Bu qiymat avvaldan mavjud' },
      P2025: { status: HttpStatus.NOT_FOUND, message: 'So‘ralgan yozuv topilmadi' },
      P2003: { status: HttpStatus.BAD_REQUEST, message: 'Bog‘langan yozuv topilmadi' },
      P2011: { status: HttpStatus.BAD_REQUEST, message: 'Majburiy maydon bo‘sh bo‘lishi mumkin emas' },
    };
    const known = knownErrors[exception.code];
    if (!known) {
      this.logger.error(
        `Unhandled Prisma error ${exception.code}`,
        exception.stack,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Ma’lumotlar bazasi so‘rovini bajarib bo‘lmadi',
      });
      return;
    }
    response.status(known.status).json({
      statusCode: known.status,
      message: known.message,
    });
  }
}
