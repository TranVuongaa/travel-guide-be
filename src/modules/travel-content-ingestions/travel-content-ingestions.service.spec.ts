import { TravelContentIngestionStatus, TravelTrendType } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { TravelContentIngestionNotFoundException } from '../../common/exceptions/travel-content-ingestion.exceptions';
import { PrismaService } from '../../database/prisma.service';
import { OxylabsClient } from './oxylabs.client';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

function createRun() {
  return {
    id: RUN_ID,
    requestedById: ADMIN_ID,
    status: TravelContentIngestionStatus.QUEUED,
    requestParameters: {},
    trendKeywordCount: 0,
    discoveredUrlCount: 0,
    importedPostCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errorSummary: null,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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

  it('should persist and enqueue an admin-triggered run', async () => {
    const run = createRun();
    const prisma = {
      travelContentIngestionRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(run),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue({ id: RUN_ID }) };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      {} as OxylabsClient,
      queue as never,
    );

    await expect(service.createRun(ADMIN_ID)).resolves.toMatchObject({
      id: RUN_ID,
      status: TravelContentIngestionStatus.QUEUED,
    });
    expect(queue.add).toHaveBeenCalledWith(
      'run-travel-content-ingestion',
      { runId: RUN_ID, requestedById: ADMIN_ID },
      expect.objectContaining({ jobId: RUN_ID }),
    );
  });

  it('should import a valid unique article as a system draft', async () => {
    const update = jest.fn().mockResolvedValue(createRun());
    const prisma = {
      travelContentIngestionRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
      travelTrendKeyword: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      place: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'place-1', name: 'Ha Long Bay' }]),
      },
      post: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'post-1' }),
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
        markdown: '# Ha Long Bay travel guide and tourism destination',
        finalUrl: 'https://93.184.216.34/article',
      }),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      {} as never,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    const postCalls = prisma.post.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(postCalls[0]?.[0].data).toMatchObject({
      authorId: ADMIN_ID,
      placeId: 'place-1',
      externalSourceUrl: 'https://93.184.216.34/article',
      status: 'DRAFT',
      source: 'SYSTEM',
    });
    const updateCalls = update.mock.calls as unknown as Array<
      [{ where: { id: string }; data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0]).toMatchObject({
      where: { id: RUN_ID },
      data: {
        status: TravelContentIngestionStatus.COMPLETED,
        importedPostCount: 1,
      },
    });
  });

  it('should mark a run failed when no trend keywords are usable', async () => {
    const update = jest.fn().mockResolvedValue(createRun());
    const prisma = {
      travelContentIngestionRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
      travelTrendKeyword: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const oxylabs = {
      getTrendKeywords: jest.fn().mockResolvedValue([]),
    };
    const service = new TravelContentIngestionsService(
      prisma as unknown as PrismaService,
      oxylabs as unknown as OxylabsClient,
      {} as never,
    );

    await service.execute(RUN_ID, ADMIN_ID);

    const updateCalls = update.mock.calls as unknown as Array<
      [{ where: { id: string }; data: Record<string, unknown> }]
    >;
    expect(updateCalls.at(-1)?.[0]).toMatchObject({
      where: { id: RUN_ID },
      data: {
        status: TravelContentIngestionStatus.FAILED,
        importedPostCount: 0,
        failedCount: 1,
      },
    });
  });
});
