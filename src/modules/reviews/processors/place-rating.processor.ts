import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database/prisma.service';
import {
  PLACE_RATING_QUEUE,
  RECALCULATE_PLACE_RATING_JOB,
} from '../reviews.constants';

export interface RecalculatePlaceRatingJob {
  placeId: string;
}

@Injectable()
@Processor(PLACE_RATING_QUEUE)
export class PlaceRatingProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<RecalculatePlaceRatingJob>): Promise<void> {
    if (job.name !== RECALCULATE_PLACE_RATING_JOB) {
      return;
    }

    const aggregate = await this.prisma.review.aggregate({
      where: {
        placeId: job.data.placeId,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await this.prisma.place.update({
      where: { id: job.data.placeId },
      data: {
        avgRating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }
}
