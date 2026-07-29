import { TravelContentIngestionStatus, TravelTrendType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { SortOrder } from '../../common/dto/pagination.dto';
import { TravelContentIngestionNotFoundException } from '../../common/exceptions/travel-content-ingestion.exceptions';
import { PrismaService } from '../../database/prisma.service';
import { OxylabsClient } from './oxylabs.client';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const config = {
  get: jest.fn((_key: string, fallback?: unknown) => fallback),
} as unknown as ConfigService;

function createRun() {
  return {
    id: RUN_ID,
    requestedById: ADMIN_ID,
    status: TravelContentIngestionStatus.QUEUED,
    requestParameters: {},
    trendKeywordCount: 0,
    discoveredUrlCount: 0,
    discoveredPlaceCount: 0,
    importedPlaceCount: 0,
    updatedPlaceCount: 0,
    updatedPostCount: 0,
    importedPostCount: 0,
    publishedPostCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    failedCount: 0,
    attemptCount: 0,
    errorSummary: null,
    leaseExpiresAt: null,
    leaseToken: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
  };
}

describe('TravelContentIngestionsService', () => {
  it('should return polling metadata for active and terminal runs', async () => {
    const prisma = {
      travelContentIngestionRun: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            ...createRun(),
            status: TravelContentIngestionStatus.RUNNING,
          })
          .mockResolvedValueOnce({
            ...createRun(),
            status: TravelContentIngestionStatus.COMPLETED,
            completedAt: new Date(),
          }),
      },
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      {} as OxylabsClient,
      config,
    );

    await expect(service.findOne(RUN_ID)).resolves.toMatchObject({
      status: TravelContentIngestionStatus.RUNNING,
      isTerminal: false,
      pollAfterMs: 3000,
    });
    await expect(service.findOne(RUN_ID)).resolves.toMatchObject({
      status: TravelContentIngestionStatus.COMPLETED,
      isTerminal: true,
      pollAfterMs: null,
    });
  });

  it('should throw the domain not-found error for a missing run', async () => {
    const prisma = {
      travelContentIngestionRun: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      {} as OxylabsClient,
      config,
    );

    await expect(service.findOne(RUN_ID)).rejects.toBeInstanceOf(
      TravelContentIngestionNotFoundException,
    );
  });

  it('should list filtered run history with deterministic pagination', async () => {
    const run = createRun();
    const prisma = {
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
      travelContentIngestionRun: {
        findMany: jest.fn().mockResolvedValue([run]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      {} as OxylabsClient,
      config,
    );

    await expect(
      service.findAll({
        page: 2,
        limit: 10,
        sortOrder: SortOrder.ASC,
        status: TravelContentIngestionStatus.QUEUED,
      }),
    ).resolves.toMatchObject({
      page: 2,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.travelContentIngestionRun.findMany).toHaveBeenCalledWith({
      where: { status: TravelContentIngestionStatus.QUEUED },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: SortOrder.ASC }, { id: SortOrder.ASC }],
    });
    expect(prisma.travelContentIngestionRun.count).toHaveBeenCalledWith({
      where: { status: TravelContentIngestionStatus.QUEUED },
    });
  });

  it('should persist an admin-triggered run in the PostgreSQL queue', async () => {
    const run = createRun();
    const prisma = {
      travelContentIngestionRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(run),
      },
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      {} as OxylabsClient,
      config,
    );

    await expect(service.createRun(ADMIN_ID)).resolves.toMatchObject({
      id: RUN_ID,
      status: TravelContentIngestionStatus.QUEUED,
    });
    const createCalls = prisma.travelContentIngestionRun.create.mock
      .calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    expect(createCalls[0]?.[0]).toMatchObject({
      data: { requestedById: ADMIN_ID },
    });
  });

  it('should import a valid unique article as a published system post', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const postCreate = jest.fn().mockResolvedValue({ id: 'post-1' });
    const transaction = {
      post: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: postCreate,
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      travelContentIngestionRun: {
        updateMany,
      },
      travelTrendKeyword: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      province: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'province-1', name: 'Quảng Ninh', places: [] },
          ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      place: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'place-1',
            name: 'Ha Long Bay',
            provinceId: 'province-1',
            description: 'Existing description',
            content: '<p>Existing content</p>',
            address: null,
            latitude: null,
            longitude: null,
          },
        ]),
      },
      post: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const oxylabs = {
      getTrendKeywords: jest.fn().mockResolvedValue([
        {
          seedKeyword: 'travel',
          keyword: 'Ha Long Bay travel',
          trendType: TravelTrendType.RISING,
          value: 100,
          formattedValue: 'Breakout',
          sourceJobId: 'trend-job',
          sourceLink: null,
        },
      ]),
      searchNews: jest.fn().mockResolvedValue([
        {
          title: 'Ha Long Bay travel destination guide',
          description: 'Places to visit in Ha Long Bay.',
          url: 'https://93.184.216.34/article?utm_source=test',
          sourceName: 'Travel Source',
          publishedAt: null,
        },
      ]),
      scrapeArticle: jest.fn().mockResolvedValue({
        rawHtml: '',
        markdown:
          '# Ha Long Bay travel guide\n\nHa Long Bay is a famous travel destination in Vietnam with limestone islands, boat routes, viewpoints, local culture, and practical tourism information for visitors planning a complete journey through Quang Ninh province. Travelers can explore caves, join cruises, and learn about responsible ways to visit this destination.',
        finalUrl: 'https://93.184.216.34/article',
      }),
      searchWeb: jest.fn().mockResolvedValue([]),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      config,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    const postCalls = postCreate.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(postCalls[0]?.[0].data).toMatchObject({
      authorId: ADMIN_ID,
      placeId: 'place-1',
      externalSourceUrl: 'https://93.184.216.34/article',
      status: 'PUBLISHED',
      source: 'SYSTEM',
    });
    const updateCalls = updateMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0]).toMatchObject({
      data: {
        status: TravelContentIngestionStatus.COMPLETED,
        importedPostCount: 1,
        publishedPostCount: 1,
      },
    });
  });

  it('should refresh a materially shorter ingestion-origin system post', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const postUpdate = jest.fn().mockResolvedValue({ id: 'post-existing' });
    const postCreate = jest.fn();
    const transaction = {
      post: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'post-existing',
          content: '<p>Short imported travel guide.</p>',
          source: 'SYSTEM',
          ingestionRunId: 'older-run',
          placeId: null,
          deletedAt: null,
        }),
        create: postCreate,
        update: postUpdate,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      travelContentIngestionRun: { updateMany },
      travelTrendKeyword: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      province: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      place: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      post: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const longBody =
      'Vietnam travel destination guide with practical itinerary details, local culture, transport advice, responsible tourism tips, and useful places to visit. '.repeat(
        12,
      );
    const oxylabs = {
      getTrendKeywords: jest.fn().mockResolvedValue([]),
      searchNews: jest.fn().mockResolvedValue([
        {
          title: 'Vietnam travel destination guide',
          description: 'A longer practical Vietnam travel guide.',
          url: 'https://93.184.216.34/existing-guide',
          sourceName: 'Travel Source',
          publishedAt: null,
        },
      ]),
      searchWeb: jest.fn().mockResolvedValue([]),
      scrapeArticle: jest.fn().mockResolvedValue({
        rawHtml: `<article><h1>Vietnam travel guide</h1><p>${longBody}</p></article>`,
        markdown: '',
        finalUrl: 'https://93.184.216.34/existing-guide',
      }),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      config,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    expect(postCreate).not.toHaveBeenCalled();
    const postUpdateCalls = postUpdate.mock.calls as unknown as Array<
      [
        {
          where: { id: string };
          data: { description: string; content: string };
        },
      ]
    >;
    expect(postUpdateCalls[0]?.[0].where).toEqual({ id: 'post-existing' });
    expect(postUpdateCalls[0]?.[0].data.description).toBe(
      'A longer practical Vietnam travel guide.',
    );
    expect(postUpdateCalls[0]?.[0].data.content).toContain(
      '<h2>Vietnam travel guide</h2>',
    );
    const updateCalls = updateMany.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0].data).toMatchObject({
      status: TravelContentIngestionStatus.COMPLETED,
      updatedPostCount: 1,
      importedPostCount: 0,
      publishedPostCount: 0,
    });
  });

  it('should create a published Place and linked Post in one transaction', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const placeCreate = jest.fn().mockResolvedValue({
      id: 'place-new',
      name: 'Bà Nà Hills',
      provinceId: 'province-1',
      description: 'A useful destination description',
      content: '<p>Useful destination content</p>',
      address: null,
      latitude: null,
      longitude: null,
    });
    const postCreate = jest.fn().mockResolvedValue({ id: 'post-new' });
    const transaction = {
      post: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: postCreate,
        update: jest.fn(),
      },
      place: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: placeCreate,
        update: jest.fn(),
      },
      placeCategory: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      travelContentIngestionRun: {
        updateMany,
      },
      travelTrendKeyword: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      province: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'province-1', name: 'Đà Nẵng', places: [] },
          ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-entertainment',
            name: 'Vui chơi & giải trí',
            slug: 'vui-choi-giai-tri',
          },
        ]),
      },
      place: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      post: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const longBody =
      'Bà Nà Hills là khu du lịch vui chơi và giải trí nổi tiếng tại Đà Nẵng với cảnh quan trên núi, nhiều trải nghiệm tham quan, công viên và thông tin hữu ích cho du khách. '.repeat(
        4,
      );
    const oxylabs = {
      getTrendKeywords: jest.fn().mockResolvedValue([]),
      searchNews: jest.fn().mockResolvedValue([]),
      searchWeb: jest.fn().mockResolvedValue([
        {
          title: 'Bà Nà Hills - địa điểm du lịch Đà Nẵng',
          description: 'Kinh nghiệm du lịch Bà Nà Hills',
          url: 'https://93.184.216.34/ba-na',
          sourceName: 'Travel Source',
          publishedAt: null,
          query: 'địa điểm du lịch Đà Nẵng',
          searchType: 'WEB',
          rank: 1,
          provinceHint: { id: 'province-1', name: 'Đà Nẵng' },
        },
      ]),
      scrapeArticle: jest.fn().mockResolvedValue({
        rawHtml: '',
        markdown: `# Bà Nà Hills\n\n${longBody}\n\n## 1. Bà Nà Hills\n\n${longBody}`,
        finalUrl: 'https://93.184.216.34/ba-na',
      }),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      config,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    const placeCalls = placeCreate.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(placeCalls[0]?.[0].data).toMatchObject({
      name: 'Bà Nà Hills',
      status: 'PUBLISHED',
      provinceId: 'province-1',
      ingestionRunId: RUN_ID,
    });
    const postCalls = postCreate.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(postCalls[0]?.[0].data).toMatchObject({
      placeId: 'place-new',
      status: 'PUBLISHED',
      source: 'SYSTEM',
    });
    const updateCalls = updateMany.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0].data).toMatchObject({
      status: TravelContentIngestionStatus.COMPLETED,
      importedPlaceCount: 1,
      publishedPostCount: 1,
    });
  });

  it('should use fallback queries when no trend keywords are usable', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      travelContentIngestionRun: {
        updateMany,
      },
      travelTrendKeyword: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      province: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      place: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      post: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const oxylabs = {
      getTrendKeywords: jest.fn().mockResolvedValue([]),
      searchNews: jest.fn().mockResolvedValue([]),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      config,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    const updateCalls = updateMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0]).toMatchObject({
      data: {
        status: TravelContentIngestionStatus.FAILED,
        importedPostCount: 0,
        failedCount: 1,
      },
    });
    expect(oxylabs.searchNews).toHaveBeenCalledWith(
      'địa điểm du lịch Việt Nam',
    );
  });
});
