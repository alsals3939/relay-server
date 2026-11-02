import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME?.trim() || 'Relay Admin';
  const databaseUrl = process.env.DATABASE_URL;

  if (!email || !password || !databaseUrl) {
    throw new Error(
      'DATABASE_URL, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD를 설정해주세요.',
    );
  }

  if (password.length < 12) {
    throw new Error('슈퍼어드민 비밀번호는 12자 이상이어야 합니다.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        globalRole: 'SUPERADMIN',
      },
      update: {
        name,
        globalRole: 'SUPERADMIN',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
