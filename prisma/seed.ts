import { PrismaClient } from '@prisma/client';

import {
  CATEGORY_SEEDS,
  PROVINCE_SEEDS,
} from '../src/database/reference-seed.data';

const prisma = new PrismaClient();

async function seedReferenceData(): Promise<void> {
  await prisma.$transaction(
    PROVINCE_SEEDS.map(({ name, slug }) =>
      prisma.province.upsert({
        where: { slug },
        create: { name, slug },
        update: { name },
      }),
    ),
  );

  await prisma.$transaction(
    CATEGORY_SEEDS.map(({ name, slug }) =>
      prisma.category.upsert({
        where: { slug },
        create: { name, slug },
        update: { name },
      }),
    ),
  );
}

async function run(): Promise<void> {
  try {
    await seedReferenceData();
  } catch {
    console.error('Failed to seed Province and Category reference data');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
