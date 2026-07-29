import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import { TravelContentIngestionRunner } from './travel-content-ingestion.runner';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

describe('TravelContentIngestionRunner', () => {
  it('should execute the oldest claimable PostgreSQL run', async () => {
    const prisma = {
      travelContentIngestionRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: RUN_ID, requestedById: ADMIN_ID }),
      },
    };
    const ingestions = {
      execute: jest.fn().mockResolvedValue(true),
    };
    const runner = new TravelContentIngestionRunner(
      prisma as unknown as PrismaService,
      ingestions as unknown as TravelContentIngestionsService,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
    );

    await expect(runner.pollOnce()).resolves.toBe(true);
    expect(ingestions.execute).toHaveBeenCalledWith(RUN_ID, ADMIN_ID);
    expect(prisma.travelContentIngestionRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('should fail exhausted runs before polling for retryable work', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      travelContentIngestionRun: {
        updateMany,
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const runner = new TravelContentIngestionRunner(
      prisma as unknown as PrismaService,
      { execute: jest.fn() } as unknown as TravelContentIngestionsService,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
    );

    await expect(runner.pollOnce()).resolves.toBe(false);
    const updateCalls = updateMany.mock.calls as unknown as Array<
      [
        {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        },
      ]
    >;
    expect(updateCalls[0]?.[0]).toMatchObject({
      where: { attemptCount: { gte: 3 } },
      data: {
        status: 'FAILED',
        leaseExpiresAt: null,
        leaseToken: null,
      },
    });
  });
});
