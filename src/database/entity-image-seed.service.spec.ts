import { Prisma } from '@prisma/client';

import { CommonsImageResolver } from './commons-image.resolver';
import {
  EntityImageOwnerType,
  EntityImageSeedRecord,
} from './entity-image-seed.data';
import { EntityImageSeedService } from './entity-image-seed.service';
import { PrismaService } from './prisma.service';

const seeds: EntityImageSeedRecord[] = [
  {
    ownerType: EntityImageOwnerType.PROVINCE,
    ownerSlug: 'province',
    fileTitle: 'File:Province.jpg',
    altText: 'Province',
    sortOrder: 0,
  },
  {
    ownerType: EntityImageOwnerType.CATEGORY,
    ownerSlug: 'category',
    fileTitle: 'File:Category.jpg',
    altText: 'Category',
    sortOrder: 0,
  },
  {
    ownerType: EntityImageOwnerType.PLACE,
    ownerSlug: 'place',
    fileTitle: 'File:Place.jpg',
    altText: 'Place',
    sortOrder: 0,
  },
];

function resolved(seed: EntityImageSeedRecord) {
  return {
    seed,
    url: `https://upload.wikimedia.org/${seed.ownerSlug}.jpg`,
    sourcePageUrl: `https://commons.wikimedia.org/wiki/${seed.fileTitle}`,
    author: 'Author',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    width: 1600,
    height: 900,
  };
}

describe('EntityImageSeedService', () => {
  let prisma: {
    province: { findMany: jest.Mock };
    category: { findMany: jest.Mock };
    place: { findMany: jest.Mock };
    entityImage: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let resolver: { resolveAll: jest.Mock };

  beforeEach(() => {
    prisma = {
      province: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'province-id', slug: 'province' }]),
      },
      category: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'category-id', slug: 'category' }]),
      },
      place: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'place-id', slug: 'place' }]),
      },
      entityImage: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (
        callback: (transaction: {
          entityImage: { upsert: jest.Mock };
        }) => Promise<void>,
      ) => callback({ entityImage: prisma.entityImage }),
    );
    resolver = {
      resolveAll: jest
        .fn()
        .mockResolvedValue(seeds.map((item) => resolved(item))),
    };
  });

  it('should resolve first and transactionally upsert every owner type', async () => {
    const service = new EntityImageSeedService(
      prisma as unknown as PrismaService,
      resolver as unknown as CommonsImageResolver,
      seeds,
    );

    await expect(service.run()).resolves.toBe(3);
    expect(resolver.resolveAll).toHaveBeenCalledWith(seeds);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.entityImage.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          provinceId_sortOrder: {
            provinceId: 'province-id',
            sortOrder: 0,
          },
        },
      }),
    );
    expect(prisma.entityImage.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          categoryId_sortOrder: {
            categoryId: 'category-id',
            sortOrder: 0,
          },
        },
      }),
    );
    expect(prisma.entityImage.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          placeId_sortOrder: { placeId: 'place-id', sortOrder: 0 },
        },
      }),
    );
  });

  it('should fail before remote resolution when a manifest owner is missing', async () => {
    prisma.place.findMany.mockResolvedValue([]);
    const service = new EntityImageSeedService(
      prisma as unknown as PrismaService,
      resolver as unknown as CommonsImageResolver,
      seeds,
    );

    await expect(service.run()).rejects.toThrow(
      'Entity image owners not found: place:place',
    );
    expect(resolver.resolveAll).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject duplicate manifest owner ordering', async () => {
    const service = new EntityImageSeedService(
      prisma as unknown as PrismaService,
      resolver as unknown as CommonsImageResolver,
      [seeds[0], seeds[0]],
    );

    await expect(service.run()).rejects.toThrow(
      'Entity image seed manifest has duplicate owner ordering',
    );
    expect(prisma.province.findMany).not.toHaveBeenCalled();
  });

  it('should propagate a transactional upsert failure', async () => {
    prisma.entityImage.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const service = new EntityImageSeedService(
      prisma as unknown as PrismaService,
      resolver as unknown as CommonsImageResolver,
      seeds,
    );

    await expect(service.run()).rejects.toThrow('Write failed');
  });
});
