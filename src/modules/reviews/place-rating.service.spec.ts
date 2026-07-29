import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { PlaceRatingService } from './place-rating.service';

const PLACE_ID = '11111111-1111-4111-8111-111111111111';

describe('PlaceRatingService', () => {
  it('should recalculate the published non-deleted rating aggregate', async () => {
    const prisma = {
      review: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: 4.5 },
          _count: { _all: 2 },
        }),
      },
      place: { update: jest.fn().mockResolvedValue({ id: PLACE_ID }) },
    };
    const service = new PlaceRatingService(prisma as unknown as PrismaService);

    await service.recalculate(PLACE_ID);

    expect(prisma.review.aggregate).toHaveBeenCalledWith({
      where: {
        placeId: PLACE_ID,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });
    expect(prisma.place.update).toHaveBeenCalledWith({
      where: { id: PLACE_ID },
      data: { avgRating: 4.5, reviewCount: 2 },
    });
  });

  it('should reset the aggregate when no published reviews remain', async () => {
    const prisma = {
      review: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: null },
          _count: { _all: 0 },
        }),
      },
      place: { update: jest.fn().mockResolvedValue({ id: PLACE_ID }) },
    };
    const service = new PlaceRatingService(prisma as unknown as PrismaService);

    await service.recalculate(PLACE_ID);

    expect(prisma.place.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { avgRating: 0, reviewCount: 0 },
      }),
    );
  });
});
