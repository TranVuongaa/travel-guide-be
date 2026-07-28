import 'dotenv/config';

import { PrismaClient, Role } from '@prisma/client';
import { argon2id, hash } from 'argon2';

const prisma = new PrismaClient();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to bootstrap an administrator`);
  }
  return value;
}

async function bootstrapAdmin(): Promise<void> {
  const email = requiredEnvironment('ADMIN_EMAIL').toLowerCase();
  const password = requiredEnvironment('ADMIN_PASSWORD');
  const displayName = requiredEnvironment('ADMIN_DISPLAY_NAME');
  if (password.length < 8 || password.length > 128) {
    throw new Error('ADMIN_PASSWORD must be between 8 and 128 characters');
  }

  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: Number.parseInt(process.env.ARGON2_MEMORY_COST ?? '19456', 10),
    timeCost: Number.parseInt(process.env.ARGON2_TIME_COST ?? '2', 10),
    parallelism: Number.parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
  });
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      displayName,
      role: Role.ADMIN,
      isActive: true,
    },
    update: {
      passwordHash,
      displayName,
      role: Role.ADMIN,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  console.log(`Administrator ready: ${admin.email} (${admin.id})`);
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Administrator bootstrap failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
