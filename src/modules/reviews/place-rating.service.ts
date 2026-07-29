import { Injectable } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PlaceRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(placeId: string): Promise<void> {
    const aggregate = await this.prisma.review.aggregate({
      where: {
        placeId,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await this.prisma.place.update({
      where: { id: placeId },
      data: {
        avgRating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }
}
