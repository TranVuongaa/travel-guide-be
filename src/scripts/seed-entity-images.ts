import { CommonsImageResolver } from '../database/commons-image.resolver';
import { EntityImageSeedService } from '../database/entity-image-seed.service';
import { PrismaService } from '../database/prisma.service';

const prisma = new PrismaService();

async function run(): Promise<void> {
  try {
    await prisma.$connect();
    const service = new EntityImageSeedService(
      prisma,
      new CommonsImageResolver(),
    );
    const count = await service.run();
    console.log(`Seeded ${count} Province, Category, and Place images`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Failed to seed entity images: ${error.message}`
        : 'Failed to seed entity images',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
