import { ContentStatus, Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { CategoryNotFoundException } from '../../common/exceptions/category-not-found.exception';
import { PlaceCategoryDuplicateException } from '../../common/exceptions/place-category-duplicate.exception';
import { PlaceNotFoundException } from '../../common/exceptions/place-not-found.exception';
import { ProvinceNotFoundException } from '../../common/exceptions/province-not-found.exception';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { PlaceSortBy, QueryPlaceDto } from './dto/query-place.dto';
import { PlaceWithRelations } from './interfaces/place-with-relations.interface';
import { PlacesService } from './places.service';

const PLACE_ID = '11111111-1111-4111-8111-111111111111';
const PROVINCE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const place: PlaceWithRelations = {
  id: PLACE_ID,
  name: 'Ha Long Bay',
  slug: 'ha-long-bay',
  description: 'Limestone islands and emerald water.',
  content: '<p>Limestone islands and emerald water.</p>',
  address: 'Quang Ninh',
  latitude: 20.9101,
  longitude: 107.1839,
  provinceId: PROVINCE_ID,
  avgRating: 4.8,
  reviewCount: 25,
  status: ContentStatus.PUBLISHED,
  createdById: USER_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  images: [],
  province: {
    id: PROVINCE_ID,
    name: 'Quang Ninh',
    slug: 'quang-ninh',
  },
  categories: [
    {
      placeId: PLACE_ID,
      categoryId: CATEGORY_ID,
      category: {
        id: CATEGORY_ID,
        name: 'Nature',
        slug: 'nature',
      },
    },
  ],
};

interface PrismaMock {
  place: {
    findMany: jest.MockedFunction<
      (args: Prisma.PlaceFindManyArgs) => Promise<PlaceWithRelations[]>
    >;
    count: jest.MockedFunction<
      (args: Prisma.PlaceCountArgs) => Promise<number>
    >;
    findFirst: jest.MockedFunction<
      (args: Prisma.PlaceFindFirstArgs) => Promise<PlaceWithRelations | null>
    >;
    findUnique: jest.MockedFunction<
      (args: Prisma.PlaceFindUniqueArgs) => Promise<{ id: string } | null>
    >;
    create: jest.MockedFunction<
      (args: Prisma.PlaceCreateArgs) => Promise<PlaceWithRelations>
    >;
    update: jest.MockedFunction<
      (args: Prisma.PlaceUpdateArgs) => Promise<PlaceWithRelations>
    >;
  };
  province: {
    findUnique: jest.MockedFunction<
      (args: Prisma.ProvinceFindUniqueArgs) => Promise<{ id: string } | null>
    >;
  };
  category: {
    findMany: jest.MockedFunction<
      (args: Prisma.CategoryFindManyArgs) => Promise<Array<{ id: string }>>
    >;
  };
  $transaction: jest.Mock;
}

describe('PlacesService', () => {
  let service: PlacesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      place: {
        findMany:
          jest.fn<
            (args: Prisma.PlaceFindManyArgs) => Promise<PlaceWithRelations[]>
          >(),
        count: jest.fn<(args: Prisma.PlaceCountArgs) => Promise<number>>(),
        findFirst:
          jest.fn<
            (
              args: Prisma.PlaceFindFirstArgs,
            ) => Promise<PlaceWithRelations | null>
          >(),
        findUnique:
          jest.fn<
            (args: Prisma.PlaceFindUniqueArgs) => Promise<{ id: string } | null>
          >(),
        create:
          jest.fn<
            (args: Prisma.PlaceCreateArgs) => Promise<PlaceWithRelations>
          >(),
        update:
          jest.fn<
            (args: Prisma.PlaceUpdateArgs) => Promise<PlaceWithRelations>
          >(),
      },
      province: {
        findUnique:
          jest.fn<
            (
              args: Prisma.ProvinceFindUniqueArgs,
            ) => Promise<{ id: string } | null>
          >(),
      },
      category: {
        findMany:
          jest.fn<
            (
              args: Prisma.CategoryFindManyArgs,
            ) => Promise<Array<{ id: string }>>
          >(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (
        input:
          Promise<unknown>[] | ((transaction: PrismaMock) => Promise<unknown>),
      ) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input(prisma);
      },
    );
    service = new PlacesService(prisma as unknown as PrismaService);
  });

  it('should return searched and paginated published places', async () => {
    prisma.place.findMany.mockResolvedValue([place]);
    prisma.place.count.mockResolvedValue(21);
    const query = Object.assign(new QueryPlaceDto(), {
      page: 2,
      limit: 10,
      search: 'VỊNH HẠ LONG',
      provinceId: PROVINCE_ID,
      categoryId: CATEGORY_ID,
      sortBy: PlaceSortBy.NAME,
      sortOrder: SortOrder.ASC,
    });

    const result = await service.findAll(query);

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: PLACE_ID,
          categories: [place.categories[0].category],
        }),
      ],
      page: 2,
      limit: 10,
      totalItems: 21,
      totalPages: 3,
    });
    const findManyArgs = prisma.place.findMany.mock.calls[0][0];
    expect(findManyArgs.skip).toBe(10);
    expect(findManyArgs.take).toBe(10);
    expect(findManyArgs.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(findManyArgs.where).toEqual({
      status: ContentStatus.PUBLISHED,
      provinceId: PROVINCE_ID,
      categories: { some: { categoryId: CATEGORY_ID } },
      searchText: { contains: 'vinh ha long' },
    });
  });

  it('should return zero total pages for an empty result', async () => {
    prisma.place.findMany.mockResolvedValue([]);
    prisma.place.count.mockResolvedValue(0);

    const result = await service.findAll(new QueryPlaceDto());

    expect(result).toEqual({
      items: [],
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it('should return a published place by id', async () => {
    prisma.place.findFirst.mockResolvedValue(place);

    await expect(service.findOneOrFail(PLACE_ID)).resolves.toEqual(
      expect.objectContaining({
        id: PLACE_ID,
        province: place.province,
      }),
    );
    expect(prisma.place.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLACE_ID, status: ContentStatus.PUBLISHED },
      }),
    );
  });

  it('should throw when a published place does not exist', async () => {
    prisma.place.findFirst.mockResolvedValue(null);

    await expect(service.findOneOrFail(PLACE_ID)).rejects.toBeInstanceOf(
      PlaceNotFoundException,
    );
  });

  it('should create a place with validated relations and a unique slug', async () => {
    prisma.province.findUnique.mockResolvedValue({ id: PROVINCE_ID });
    prisma.category.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);
    prisma.place.findUnique
      .mockResolvedValueOnce({ id: 'another-place' })
      .mockResolvedValueOnce(null);
    prisma.place.create.mockResolvedValue({
      ...place,
      slug: 'ha-long-bay-2',
    });
    const dto: CreatePlaceDto = {
      name: 'Ha Long Bay',
      description: place.description,
      content:
        '<p>Explore <strong>Ha Long Bay</strong>.</p><script>alert("xss")</script>',
      address: place.address ?? undefined,
      latitude: place.latitude ?? undefined,
      longitude: place.longitude ?? undefined,
      provinceId: PROVINCE_ID,
      categoryIds: [CATEGORY_ID],
    };

    const result = await service.create(USER_ID, dto);

    expect(result.slug).toBe('ha-long-bay-2');
    const createArgs = prisma.place.create.mock.calls[0][0] as unknown as {
      data: Prisma.PlaceCreateInput;
    };
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        slug: 'ha-long-bay-2',
        content: '<p>Explore <strong>Ha Long Bay</strong>.</p>',
        createdBy: { connect: { id: USER_ID } },
        province: { connect: { id: PROVINCE_ID } },
        categories: { create: [{ categoryId: CATEGORY_ID }] },
      }),
    );
  });

  it('should reject create when the province does not exist', async () => {
    prisma.province.findUnique.mockResolvedValue(null);

    await expect(
      service.create(USER_ID, {
        name: place.name,
        description: place.description,
        content: place.content,
        provinceId: PROVINCE_ID,
        categoryIds: [CATEGORY_ID],
      }),
    ).rejects.toBeInstanceOf(ProvinceNotFoundException);
    expect(prisma.place.create).not.toHaveBeenCalled();
  });

  it('should reject create when a category does not exist', async () => {
    prisma.province.findUnique.mockResolvedValue({ id: PROVINCE_ID });
    prisma.category.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);

    await expect(
      service.create(USER_ID, {
        name: place.name,
        description: place.description,
        content: place.content,
        provinceId: PROVINCE_ID,
        categoryIds: [CATEGORY_ID, SECOND_CATEGORY_ID],
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundException);
  });

  it('should reject duplicate category ids at the service boundary', async () => {
    await expect(
      service.create(USER_ID, {
        name: place.name,
        description: place.description,
        content: place.content,
        provinceId: PROVINCE_ID,
        categoryIds: [CATEGORY_ID, CATEGORY_ID],
      }),
    ).rejects.toBeInstanceOf(PlaceCategoryDuplicateException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should atomically update fields, slug, and category links', async () => {
    prisma.place.findFirst.mockResolvedValue(place);
    prisma.category.findMany.mockResolvedValue([{ id: SECOND_CATEGORY_ID }]);
    prisma.place.findUnique.mockResolvedValue(null);
    prisma.place.update.mockResolvedValue({
      ...place,
      name: 'Ha Long Islands',
      slug: 'ha-long-islands',
      categories: [
        {
          placeId: PLACE_ID,
          categoryId: SECOND_CATEGORY_ID,
          category: {
            id: SECOND_CATEGORY_ID,
            name: 'World Heritage',
            slug: 'world-heritage',
          },
        },
      ],
    });

    const result = await service.update(PLACE_ID, {
      name: 'Ha Long Islands',
      content: '<h2>Updated guide</h2><p style="color:red">Plan a cruise.</p>',
      categoryIds: [SECOND_CATEGORY_ID],
    });

    expect(result.slug).toBe('ha-long-islands');
    const updateArgs = prisma.place.update.mock.calls[0][0] as unknown as {
      where: Prisma.PlaceWhereUniqueInput;
      data: Prisma.PlaceUpdateInput;
    };
    expect(updateArgs.where).toEqual({ id: PLACE_ID });
    expect(updateArgs.data).toEqual(
      expect.objectContaining({
        name: 'Ha Long Islands',
        slug: 'ha-long-islands',
        content: '<h2>Updated guide</h2><p>Plan a cruise.</p>',
        categories: {
          deleteMany: {},
          create: [{ categoryId: SECOND_CATEGORY_ID }],
        },
      }),
    );
  });

  it('should throw when updating a hidden or missing place', async () => {
    prisma.place.findFirst.mockResolvedValue(null);

    await expect(
      service.update(PLACE_ID, { name: 'New name' }),
    ).rejects.toBeInstanceOf(PlaceNotFoundException);
    expect(prisma.place.update).not.toHaveBeenCalled();
  });

  it('should reject destination content without meaningful visible text', async () => {
    await expect(
      service.update(PLACE_ID, {
        content:
          '<script>alert("xss")</script><img src="https://example.com/a.jpg">',
      }),
    ).rejects.toThrow(
      'Destination content must contain meaningful visible text',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.place.update).not.toHaveBeenCalled();
  });

  it('should soft-remove an existing place', async () => {
    prisma.place.findFirst.mockResolvedValue(place);
    prisma.place.update.mockResolvedValue({
      ...place,
      status: ContentStatus.HIDDEN,
    });

    const result = await service.remove(PLACE_ID);

    expect(result.status).toBe(ContentStatus.HIDDEN);
    expect(prisma.place.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLACE_ID },
        data: { status: ContentStatus.HIDDEN },
      }),
    );
  });
});
