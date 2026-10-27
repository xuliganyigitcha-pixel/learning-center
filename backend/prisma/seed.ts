import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  await prisma.user.upsert({
    where: { login: 'superadmin' },
    update: {},
    create: {
      login: 'superadmin',
      passwordHash,
      fullName: 'Bosh administrator',
      role: 'SUPER_ADMIN',
      mustChangePw: true,
    },
  });

  const settings = [
    ['brand_name', "O'quv Markazi"],
    ['late_weight', '0.5'],
    ['excused_weight', '0.5'],
    ['monthly_fee_default', '500000'],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}

main()
  .catch((error) => {
    console.error('Seed bajarilmadi:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
