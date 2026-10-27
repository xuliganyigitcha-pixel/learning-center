import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';
import { CurrentUser, Public, Roles } from './common/decorators';

class LoginDto {
  @IsString() @MinLength(1) login!: string;
  @IsString() @MinLength(6) password!: string;
}

class PasswordDto {
  @IsString() @MinLength(8) oldPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

class StudentDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyFee?: number;
}

class StudentUpdateDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'FINISHED', 'LEFT', 'FROZEN']) status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyFee?: number;
}

class GroupDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() scheduleText?: string;
}

class GroupUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() scheduleText?: string;
  @IsOptional() @IsIn([true, false]) isActive?: boolean;
}

class LessonDto {
  @IsString() groupId!: string;
  @IsString() date!: string;
  @IsOptional() @IsString() topic?: string;
}

class PaymentDto {
  @IsString() studentId!: string;
  @Type(() => Number) @IsNumber() @Min(1) amount!: number;
  @IsString() periodMonth!: string;
  @IsOptional() @IsIn(['CASH', 'CARD', 'CLICK', 'PAYME']) method?: string;
  @IsOptional() @IsString() comment?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(
      body.login,
      body.password,
      req.ip || 'unknown',
      req.headers['user-agent'] || '',
    );
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken, ...response } = result;
    return response;
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refresh(
      req.cookies?.refreshToken,
      req.ip || 'unknown',
      req.headers['user-agent'] || '',
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.refreshToken);
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'lax', path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: { sub: string }) {
    return this.auth.me(user.sub);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: { sub: string },
    @Body() body: PasswordDto,
  ) {
    return this.auth.changePassword(user.sub, body.oldPassword, body.newPassword);
  }

  private setRefreshCookie(response: Response, token: string) {
    const days = Math.min(Math.max(Number(process.env.JWT_REFRESH_TTL_DAYS || 7), 1), 30);
    response.cookie('refreshToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }
}

@Controller()
@Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Public()
  health() {
    return { status: 'ok' };
  }

  @Get('dashboard/stats')
  async dashboardStats(@CurrentUser() user: { sub: string; role: string }) {
    const teacherFilter = user.role === 'TEACHER' ? { group: { teacherId: user.sub } } : {};
    const [students, activeStudents, groups, lessons, payments] = await Promise.all([
      this.prisma.student.count({ where: teacherFilter }),
      this.prisma.student.count({ where: { ...teacherFilter, status: 'ACTIVE' } }),
      this.prisma.group.count({
        where: { isActive: true, ...(user.role === 'TEACHER' ? { teacherId: user.sub } : {}) },
      }),
      this.prisma.lesson.count({
        where: {
          date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          ...(user.role === 'TEACHER' ? { group: { teacherId: user.sub } } : {}),
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          ...(user.role === 'TEACHER' ? { id: '__none__' } : {}),
        },
        _sum: { amount: true },
      }),
    ]);
    return { students, activeStudents, groups, todayLessons: lessons, monthPayments: payments._sum.amount || 0 };
  }

  @Get('students')
  async students(
    @Query('search') search = '',
    @Query('status') status?: string,
    @CurrentUser() user?: { sub: string; role: string },
  ) {
    const query = search.trim();
    return this.prisma.student.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(user?.role === 'TEACHER' ? { group: { teacherId: user.sub } } : {}),
        ...(query
          ? {
              OR: [
                { firstName: { contains: query } },
                { lastName: { contains: query } },
                { phone: { contains: query } },
                { studentCode: { contains: query } },
              ],
            }
          : {}),
      },
      include: { group: { select: { id: true, name: true } }, paymentPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('students')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createStudent(@Body() body: StudentDto, @CurrentUser() user: { sub: string }) {
    const studentCode = await this.uniqueStudentCode();
    return this.prisma.student.create({
      data: {
        studentCode,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        notes: body.notes?.trim() || null,
        groupId: body.groupId || null,
        ...(body.monthlyFee !== undefined
          ? { paymentPlan: { create: { monthlyFee: body.monthlyFee } } }
          : {}),
      },
      include: { group: true, paymentPlan: true },
    });
  }

  @Patch('students/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async updateStudent(@Param('id') id: string, @Body() body: StudentUpdateDto) {
    const { monthlyFee, ...student } = body;
    return this.prisma.student.update({
      where: { id },
      data: {
        ...student,
        ...(student.firstName ? { firstName: student.firstName.trim() } : {}),
        ...(student.lastName ? { lastName: student.lastName.trim() } : {}),
        ...(monthlyFee !== undefined
          ? {
              paymentPlan: {
                upsert: {
                  update: { monthlyFee },
                  create: { monthlyFee },
                },
              },
            }
          : {}),
      },
      include: { group: true, paymentPlan: true },
    });
  }

  @Get('groups')
  groups(@CurrentUser() user: { sub: string; role: string }) {
    return this.prisma.group.findMany({
      where: user.role === 'TEACHER' ? { teacherId: user.sub, isActive: true } : undefined,
      include: { teacher: { select: { id: true, fullName: true } }, _count: { select: { students: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('groups')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createGroup(@Body() body: GroupDto) {
    return this.prisma.group.create({
      data: { name: body.name.trim(), teacherId: body.teacherId || null, scheduleText: body.scheduleText || null },
    });
  }

  @Patch('groups/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateGroup(@Param('id') id: string, @Body() body: GroupUpdateDto) {
    return this.prisma.group.update({ where: { id }, data: body });
  }

  @Get('lessons')
  lessons(
    @Query('groupId') groupId?: string,
    @CurrentUser() user?: { sub: string; role: string },
  ) {
    return this.prisma.lesson.findMany({
      where: {
        ...(groupId ? { groupId } : {}),
        ...(user?.role === 'TEACHER' ? { group: { teacherId: user.sub } } : {}),
      },
      include: { group: { select: { id: true, name: true } }, _count: { select: { attendance: true, grades: true } } },
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  @Post('lessons')
  async createLesson(
    @Body() body: LessonDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Dars sanasi noto‘g‘ri');
    if (user.role === 'TEACHER') {
      const group = await this.prisma.group.findFirst({
        where: { id: body.groupId, teacherId: user.sub },
        select: { id: true },
      });
      if (!group) throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    return this.prisma.lesson.create({
      data: { groupId: body.groupId, date, topic: body.topic?.trim() || null },
      include: { group: { select: { id: true, name: true } } },
    });
  }

  @Patch('lessons/:id')
  updateLesson(
    @Param('id') id: string,
    @Body() body: { topic?: string; isCancelled?: boolean; cancelReason?: string },
    @CurrentUser() user: { sub: string; role: string },
  ) {
    if (user.role === 'TEACHER') {
      return this.prisma.lesson.updateMany({
        where: { id, group: { teacherId: user.sub } },
        data: body,
      }).then((result) => {
        if (!result.count) throw new ForbiddenException('Dars topilmadi yoki sizga biriktirilmagan');
        return { ok: true };
      });
    }
    return this.prisma.lesson.update({ where: { id }, data: body });
  }

  @Get('attendance/:lessonId')
  async attendance(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { include: { students: { orderBy: { lastName: 'asc' } } } } },
    });
    if (!lesson) throw new BadRequestException('Dars topilmadi');
    if (user.role === 'TEACHER' && lesson.group.teacherId !== user.sub) {
      throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    const entries = await this.prisma.attendance.findMany({ where: { lessonId } });
    const byStudent = new Map(entries.map((entry) => [entry.studentId, entry]));
    return lesson.group.students.map((student) => ({
      student,
      status: byStudent.get(student.id)?.status || 'PRESENT',
    }));
  }

  @Post('attendance/:lessonId')
  async saveAttendance(
    @Param('lessonId') lessonId: string,
    @Body() body: { records: { studentId: string; status: string }[] },
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { include: { students: { select: { id: true } } } } },
    });
    if (!lesson) throw new BadRequestException('Dars topilmadi');
    if (user.role === 'TEACHER' && lesson.group.teacherId !== user.sub) {
      throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    const allowed = new Set(lesson.group.students.map((student) => student.id));
    const allowedStatuses = new Set(['PRESENT', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LATE']);
    if (
      !Array.isArray(body.records) ||
      body.records.some((record) => !allowed.has(record.studentId) || !allowedStatuses.has(record.status))
    ) {
      throw new BadRequestException('Davomat ma’lumotlari noto‘g‘ri');
    }
    await this.prisma.$transaction(
      body.records.map((record) =>
        this.prisma.attendance.upsert({
          where: { lessonId_studentId: { lessonId, studentId: record.studentId } },
          update: { status: record.status, markedById: user.sub, markedAt: new Date() },
          create: { lessonId, studentId: record.studentId, status: record.status, markedById: user.sub },
        }),
      ),
    );
    return { ok: true, count: body.records.length };
  }

  @Get('grades/student/:studentId')
  async studentGrades(
    @Param('studentId') studentId: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    if (user.role === 'TEACHER') {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, group: { teacherId: user.sub } },
        select: { id: true },
      });
      if (!student) throw new ForbiddenException('Bu o‘quvchining ma’lumotlari sizga ochiq emas');
    }
    const grades = await this.prisma.grade.findMany({
      where: { studentId },
      include: { lesson: { select: { date: true, topic: true, group: { select: { name: true } } } } },
      orderBy: { gradedAt: 'desc' },
    });
    const average = grades.length
      ? Math.round((grades.reduce((sum, grade) => sum + grade.score, 0) / grades.length) * 10) / 10
      : 0;
    return { grades, average };
  }

  @Get('grades/lesson/:lessonId')
  async lessonGrades(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { select: { teacherId: true } } },
    });
    if (!lesson) throw new BadRequestException('Dars topilmadi');
    if (user.role === 'TEACHER' && lesson.group.teacherId !== user.sub) {
      throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    return this.prisma.grade.findMany({
      where: { lessonId },
      select: { studentId: true, score: true, comment: true },
    });
  }

  @Post('grades/:lessonId')
  async saveGrades(
    @Param('lessonId') lessonId: string,
    @Body() body: { records: { studentId: string; score: number; comment?: string }[] },
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { include: { students: { select: { id: true } } } } },
    });
    if (!lesson) throw new BadRequestException('Dars topilmadi');
    if (user.role === 'TEACHER' && lesson.group.teacherId !== user.sub) {
      throw new ForbiddenException('Bu guruh sizga biriktirilmagan');
    }
    const allowed = new Set(lesson.group.students.map((student) => student.id));
    if (
      !Array.isArray(body.records) ||
      body.records.some((record) => !allowed.has(record.studentId) || !Number.isInteger(record.score) || record.score < 0 || record.score > 100)
    ) {
      throw new BadRequestException('Baho 0 dan 100 gacha bo‘lishi kerak');
    }
    await this.prisma.$transaction(
      body.records.map((record) =>
        this.prisma.grade.upsert({
          where: { lessonId_studentId: { lessonId, studentId: record.studentId } },
          update: { score: record.score, comment: record.comment, gradedById: user.sub, gradedAt: new Date() },
          create: { lessonId, studentId: record.studentId, score: record.score, comment: record.comment, gradedById: user.sub },
        }),
      ),
    );
    return { ok: true, count: body.records.length };
  }

  @Get('payments')
  @Roles('SUPER_ADMIN', 'ADMIN')
  payments(@Query('month') month?: string) {
    return this.prisma.payment.findMany({
      where: month ? { periodMonth: month } : undefined,
      include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });
  }

  @Get('payments/debt/:studentId')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async studentDebt(@Param('studentId') studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { paymentPlan: true },
    });
    if (!student) throw new NotFoundException('O‘quvchi topilmadi');
    const plan = student.paymentPlan;
    if (!plan) return { debt: 0, monthlyFee: 0, expected: 0, paid: 0, months: 0 };
    const now = new Date();
    const months = Math.max(
      1,
      (now.getFullYear() - plan.startDate.getFullYear()) * 12 +
        now.getMonth() - plan.startDate.getMonth() + 1,
    );
    const monthlyFee = plan.monthlyFee * (1 - plan.discountPercent / 100);
    const expected = monthlyFee * months;
    const aggregate = await this.prisma.payment.aggregate({
      where: { studentId },
      _sum: { amount: true },
    });
    const paid = aggregate._sum.amount || 0;
    return { debt: Math.max(0, expected - paid), monthlyFee, expected, paid, months };
  }

  @Post('payments')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createPayment(@Body() body: PaymentDto, @CurrentUser() user: { sub: string }) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.periodMonth)) {
      throw new BadRequestException('Oy formati YYYY-MM bo‘lishi kerak');
    }
    return this.prisma.payment.create({
      data: {
        studentId: body.studentId,
        amount: body.amount,
        periodMonth: body.periodMonth,
        method: body.method || 'CASH',
        comment: body.comment,
        createdById: user.sub,
      },
      include: { student: { select: { firstName: true, lastName: true, studentCode: true } } },
    });
  }

  @Get('users')
  @Roles('SUPER_ADMIN', 'ADMIN')
  users() {
    return this.prisma.user.findMany({
      select: { id: true, login: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('users')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createUser(
    @Body() body: { login: string; fullName: string; phone?: string; role: string; password: string },
  ) {
    if (!body.login || !body.fullName || !body.password || body.password.length < 8) {
      throw new BadRequestException('Login, ism va kamida 8 belgili parol kerak');
    }
    if (!['ADMIN', 'TEACHER'].includes(body.role)) throw new BadRequestException('Rol noto‘g‘ri');
    return this.prisma.user.create({
      data: {
        login: body.login.trim().toLowerCase(),
        fullName: body.fullName.trim(),
        phone: body.phone?.trim() || null,
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 12),
        mustChangePw: true,
      },
      select: { id: true, login: true, fullName: true, phone: true, role: true, isActive: true },
    });
  }

  @Patch('users/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateUser(@Param('id') id: string, @Body() body: { isActive?: boolean; fullName?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: body.isActive, fullName: body.fullName, phone: body.phone },
      select: { id: true, login: true, fullName: true, phone: true, role: true, isActive: true },
    });
  }

  @Get('settings')
  settings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  @Post('settings')
  @Roles('SUPER_ADMIN')
  saveSetting(@Body() body: { key: string; value: string }) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(body.key) || typeof body.value !== 'string') {
      throw new BadRequestException('Sozlama noto‘g‘ri');
    }
    return this.prisma.setting.upsert({
      where: { key: body.key },
      update: { value: body.value },
      create: { key: body.key, value: body.value },
    });
  }

  @Get('audit')
  @Roles('SUPER_ADMIN', 'ADMIN')
  audit() {
    return this.prisma.auditLog.findMany({
      include: { user: { select: { fullName: true, login: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async uniqueStudentCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      if (!(await this.prisma.student.findUnique({ where: { studentCode: code } }))) return code;
    }
    throw new BadRequestException('O‘quvchi kodi yaratilmedi, qayta urinib ko‘ring');
  }
}

export class AttendanceRecordDto {
  @IsString() studentId!: string;
  @IsIn(['PRESENT', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LATE']) status!: string;
}

export class GradeRecordDto {
  @IsString() studentId!: string;
  @Type(() => Number) @IsInt() @Min(0) score!: number;
  @IsOptional() @IsString() comment?: string;
}
