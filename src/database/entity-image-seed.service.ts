import { Prisma } from '@prisma/client';

import {
  ENTITY_IMAGE_SEEDS,
  EntityImageOwnerType,
  EntityImageSeedRecord,
} from './entity-image-seed.data';
import {
  CommonsImageResolver,
  ResolvedEntityImage,
} from './commons-image.resolver';
import { PrismaService } from './prisma.service';

interface OwnerRecord {
  id: string;
  slug: string;
}

type OwnerIdMap = Record<EntityImageOwnerType, Map<string, string>>;

export class EntityImageSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: CommonsImageResolver,
    private readonly seeds: readonly EntityImageSeedRecord[] = ENTITY_IMAGE_SEEDS,
  ) {}

  async run(): Promise<number> {
    this.assertUniqueManifest();
    const ownerIds = await this.loadOwnerIds();
    this.assertOwnersExist(ownerIds);
    const images = await this.resolver.resolveAll(this.seeds);

    await this.prisma.$transaction(async (transaction) => {
      for (const image of images) {
        await this.upsertImage(transaction, image, ownerIds);
      }
    });

    return images.length;
  }

  private async loadOwnerIds(): Promise<OwnerIdMap> {
    const [provinces, categories, places] = await Promise.all([
      this.prisma.province.findMany({
        where: {
          slug: {
            in: this.slugsFor(EntityImageOwnerType.PROVINCE),
          },
        },
        select: { id: true, slug: true },
      }),
      this.prisma.category.findMany({
        where: {
          slug: {
            in: this.slugsFor(EntityImageOwnerType.CATEGORY),
          },
        },
        select: { id: true, slug: true },
      }),
      this.prisma.place.findMany({
        where: {
          slug: {
            in: this.slugsFor(EntityImageOwnerType.PLACE),
          },
        },
        select: { id: true, slug: true },
      }),
    ]);

    return {
      [EntityImageOwnerType.PROVINCE]: this.toIdMap(provinces),
      [EntityImageOwnerType.CATEGORY]: this.toIdMap(categories),
      [EntityImageOwnerType.PLACE]: this.toIdMap(places),
    };
  }

  private assertUniqueManifest(): void {
    const identities = this.seeds.map(
      ({ ownerType, ownerSlug, sortOrder }) =>
        `${ownerType}:${ownerSlug}:${sortOrder}`,
    );
    if (new Set(identities).size !== identities.length) {
      throw new Error(
        'Entity image seed manifest has duplicate owner ordering',
      );
    }
  }

  private assertOwnersExist(ownerIds: OwnerIdMap): void {
    const missing = this.seeds.filter(
      ({ ownerType, ownerSlug }) => !ownerIds[ownerType].has(ownerSlug),
    );
    if (missing.length) {
      throw new Error(
        `Entity image owners not found: ${missing
          .map(({ ownerType, ownerSlug }) => `${ownerType}:${ownerSlug}`)
          .join(', ')}`,
      );
    }
  }

  private async upsertImage(
    transaction: Prisma.TransactionClient,
    image: ResolvedEntityImage,
    ownerIds: OwnerIdMap,
  ): Promise<void> {
    const ownerId = ownerIds[image.seed.ownerType].get(image.seed.ownerSlug);
    if (!ownerId) {
      throw new Error(
        `Entity image owner not found: ${image.seed.ownerType}:${image.seed.ownerSlug}`,
      );
    }
    const metadata = {
      url: image.url,
      sourcePageUrl: image.sourcePageUrl,
      altText: image.seed.altText,
      author: image.author,
      licenseName: image.licenseName,
      licenseUrl: image.licenseUrl,
      width: image.width,
      height: image.height,
    };

    if (image.seed.ownerType === EntityImageOwnerType.PROVINCE) {
      await transaction.entityImage.upsert({
        where: {
          provinceId_sortOrder: {
            provinceId: ownerId,
            sortOrder: image.seed.sortOrder,
          },
        },
        create: {
          ...metadata,
          provinceId: ownerId,
          sortOrder: image.seed.sortOrder,
        },
        update: metadata,
      });
      return;
    }
    if (image.seed.ownerType === EntityImageOwnerType.CATEGORY) {
      await transaction.entityImage.upsert({
        where: {
          categoryId_sortOrder: {
            categoryId: ownerId,
            sortOrder: image.seed.sortOrder,
          },
        },
        create: {
          ...metadata,
          categoryId: ownerId,
          sortOrder: image.seed.sortOrder,
        },
        update: metadata,
      });
      return;
    }

    await transaction.entityImage.upsert({
      where: {
        placeId_sortOrder: {
          placeId: ownerId,
          sortOrder: image.seed.sortOrder,
        },
      },
      create: {
        ...metadata,
        placeId: ownerId,
        sortOrder: image.seed.sortOrder,
      },
      update: metadata,
    });
  }

  private slugsFor(ownerType: EntityImageOwnerType): string[] {
    return this.seeds
      .filter((seed) => seed.ownerType === ownerType)
      .map(({ ownerSlug }) => ownerSlug);
  }

  private toIdMap(records: OwnerRecord[]): Map<string, string> {
    return new Map(records.map(({ id, slug }) => [slug, id]));
  }
}
