import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TravelContentIngestionStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

@Injectable()
export class TravelContentIngestionRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TravelContentIngestionRunner.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestions: TravelContentIngestionsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs());
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async pollOnce(): Promise<boolean> {
    const now = new Date();
    const maxAttempts = this.maxAttempts();
    await this.prisma.travelContentIngestionRun.updateMany({
      where: {
        attemptCount: { gte: maxAttempts },
        OR: [
          { status: TravelContentIngestionStatus.QUEUED },
          {
            status: TravelContentIngestionStatus.RUNNING,
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
          },
        ],
      },
      data: {
        status: TravelContentIngestionStatus.FAILED,
        failedCount: { increment: 1 },
        errorSummary: `Ingestion exceeded ${maxAttempts} execution attempts`,
        completedAt: now,
        leaseExpiresAt: null,
        leaseToken: null,
      },
    });

    const run = await this.prisma.travelContentIngestionRun.findFirst({
      where: {
        attemptCount: { lt: maxAttempts },
        OR: [
          { status: TravelContentIngestionStatus.QUEUED },
          {
            status: TravelContentIngestionStatus.RUNNING,
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, requestedById: true },
    });
    if (!run) return false;
    return this.ingestions.execute(run.id, run.requestedById);
  }

  private async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`PostgreSQL ingestion runner failed: ${message}`);
    } finally {
      this.polling = false;
    }
  }

  private pollIntervalMs(): number {
    return this.config.get<number>(
      'travelContentIngestion.pollIntervalMs',
      3000,
    );
  }

  private maxAttempts(): number {
    return this.config.get<number>('travelContentIngestion.maxAttempts', 3);
  }
}
