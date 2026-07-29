import { ConfigService } from '@nestjs/config';
import { ContentStatus, Prisma, Role } from '@prisma/client';

import { ReviewDuplicateException } from '../../common/exceptions/content.exceptions';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ContentEngagementService } from '../../common/services/content-engagement.service';
import { PrismaService } from '../../database/prisma.service';
import { QueryMyReviewDto, QueryReviewDto } from './dto/query-review.dto';
import { ReviewWithRelations } from './interfaces/review-with-relations.interface';
import { PlaceRatingService } from './place-rating.service';
import { ReviewsService } from './reviews.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REVIEW_ID = '22222222-2222-4222-8222-222222222222';
const PLACE_ID = '33333333-3333-4333-8333-333333333333';

const user: AuthUser = {
  id: USER_ID,
  email: 'user@example.com',
  displayName: 'Traveler',
  role: Role.USER,
};

const review: ReviewWithRelations = {
  id: REVIEW_ID,
  placeId: PLACE_ID,
  authorId: USER_ID,
  rating: 5,
  content: 'Excellent',
  status: ContentStatus.PUBLISHED,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: USER_ID, displayName: 'Traveler', avatarUrl: null },
  place: { id: PLACE_ID, name: 'Hue', slug: 'hue' },
};

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database error', {
    code,
    clientVersion: 'test',
  });
}

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    review: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    place: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let rating: { recalculate: jest.Mock };

  beforeEach(() => {
    prisma = {
      review: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      place: { findFirst: jest.fn() },
      $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
    };
    rating = { recalculate: jest.fn().mockResolvedValue(undefined) };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      {
        getTargetEngagement: jest.fn().mockResolvedValue(new Map()),
      } as unknown as ContentEngagementService,
      rating as unknown as PlaceRatingService,
    );
  });

  it('should list published reviews for an existing place', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.review.findMany.mockResolvedValue([review]);
    prisma.review.count.mockResolvedValue(1);

    const result = await service.findAllForPlace(
      PLACE_ID,
      new QueryReviewDto(),
    );

    expect(result.items).toHaveLength(1);
  });

  it('should list only current user reviews', async () => {
    prisma.review.findMany.mockResolvedValue([review]);
    prisma.review.count.mockResolvedValue(1);

    await service.findMine(USER_ID, new QueryMyReviewDto());

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: USER_ID, deletedAt: null },
      }),
    );
  });

  it('should return one published review', async () => {
    prisma.review.findFirst.mockResolvedValue(review);

    await expect(service.findOneOrFail(REVIEW_ID)).resolves.toEqual(
      expect.objectContaining({ id: REVIEW_ID }),
    );
  });

  it('should reject a lifetime duplicate review', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.review.findUnique.mockResolvedValue({ id: REVIEW_ID });

    await expect(
      service.create(user, PLACE_ID, { rating: 5 }),
    ).rejects.toBeInstanceOf(ReviewDuplicateException);
  });

  it('should create pending review and recalculate the place rating', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue({
      ...review,
      status: ContentStatus.PENDING,
    });

    const result = await service.create(user, PLACE_ID, { rating: 5 });

    expect(result.status).toBe(ContentStatus.PENDING);
    expect(rating.recalculate).toHaveBeenCalledWith(PLACE_ID);
  });

  it('should map a concurrent review uniqueness race', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.review.create.mockRejectedValue(prismaError('P2002'));

    await expect(
      service.create(user, PLACE_ID, { rating: 5 }),
    ).rejects.toBeInstanceOf(ReviewDuplicateException);
  });

  it('should update an author review and recalculate the rating', async () => {
    prisma.review.findFirst.mockResolvedValue(review);
    prisma.review.update.mockResolvedValue({ ...review, rating: 4 });

    const result = await service.update(user, REVIEW_ID, { rating: 4 });

    expect(result.rating).toBe(4);
    expect(rating.recalculate).toHaveBeenCalledWith(PLACE_ID);
  });

  it('should soft-delete an author review and recalculate the rating', async () => {
    prisma.review.findFirst.mockResolvedValue(review);
    prisma.review.update.mockResolvedValue({
      ...review,
      deletedAt: new Date(),
    });

    const result = await service.remove(user, REVIEW_ID);

    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(rating.recalculate).toHaveBeenCalledWith(PLACE_ID);
  });

  it('should surface rating recalculation failure after a review write', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(review);
    rating.recalculate.mockRejectedValue(new Error('Database unavailable'));

    await expect(
      service.create({ ...user, role: Role.ADMIN }, PLACE_ID, { rating: 5 }),
    ).rejects.toThrow('Database unavailable');
  });
});
