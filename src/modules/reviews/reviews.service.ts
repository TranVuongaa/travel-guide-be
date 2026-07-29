import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommentTargetType, ContentStatus, Prisma, Role } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import {
  ReviewDuplicateException,
  ReviewNotFoundException,
} from '../../common/exceptions/content.exceptions';
import { ForbiddenDomainException } from '../../common/exceptions/identity.exceptions';
import { PlaceNotFoundException } from '../../common/exceptions/place-not-found.exception';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  ContentEngagementService,
  TargetEngagement,
} from '../../common/services/content-engagement.service';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryMyReviewDto, QueryReviewDto } from './dto/query-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  reviewWithRelationsInclude,
  ReviewWithRelations,
} from './interfaces/review-with-relations.interface';
import { PlaceRatingService } from './place-rating.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly engagement: ContentEngagementService,
    private readonly rating: PlaceRatingService,
  ) {}

  async findAllForPlace(
    placeId: string,
    query: QueryReviewDto,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    await this.ensurePlaceExists(placeId);
    return this.findPage(
      {
        placeId,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      query.page,
      query.limit,
      query.sortOrder,
    );
  }

  async findMine(
    userId: string,
    query: QueryMyReviewDto,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    return this.findPage(
      {
        authorId: userId,
        deletedAt: null,
        ...(query.placeId ? { placeId: query.placeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      query.page,
      query.limit,
      query.sortOrder,
    );
  }

  async findOneOrFail(id: string): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findFirst({
      where: {
        id,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      include: reviewWithRelationsInclude,
    });
    if (!review) {
      throw new ReviewNotFoundException(id);
    }

    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.REVIEW,
      [id],
    );
    return this.toResponse(review, metrics.get(id));
  }

  async create(
    user: AuthUser,
    placeId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    await this.ensurePlaceExists(placeId);
    const duplicate = await this.prisma.review.findUnique({
      where: { placeId_authorId: { placeId, authorId: user.id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ReviewDuplicateException();
    }

    let review: ReviewWithRelations;
    try {
      review = await this.prisma.review.create({
        data: {
          placeId,
          authorId: user.id,
          rating: dto.rating,
          content: dto.content,
          status: this.getSubmissionStatus(user.role),
        },
        include: reviewWithRelationsInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ReviewDuplicateException();
      }
      throw error;
    }

    await this.rating.recalculate(placeId);
    return this.toResponse(review);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    if (dto.rating === undefined && dto.content === undefined) {
      throw new BadRequestException('At least one field must be provided');
    }
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id) {
      throw new ForbiddenDomainException();
    }

    const review = await this.prisma.review.update({
      where: { id },
      data: {
        rating: dto.rating,
        content: dto.content,
        status: this.getSubmissionStatus(user.role),
      },
      include: reviewWithRelationsInclude,
    });
    await this.rating.recalculate(review.placeId);
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.REVIEW,
      [id],
    );
    return this.toResponse(review, metrics.get(id));
  }

  async remove(user: AuthUser, id: string): Promise<ReviewResponseDto> {
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenDomainException();
    }

    const review = await this.prisma.review.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: reviewWithRelationsInclude,
    });
    await this.rating.recalculate(review.placeId);
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.REVIEW,
      [id],
    );
    return this.toResponse(review, metrics.get(id));
  }

  private async findPage(
    where: Prisma.ReviewWhereInput,
    page: number,
    limit: number,
    sortOrder: SortOrder,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    const [reviews, totalItems] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: sortOrder }, { id: sortOrder }],
        include: reviewWithRelationsInclude,
      }),
      this.prisma.review.count({ where }),
    ]);
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.REVIEW,
      reviews.map(({ id }) => id),
    );

    return {
      items: reviews.map((review) =>
        this.toResponse(review, metrics.get(review.id)),
      ),
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
  }

  private async findEditableOrFail(id: string): Promise<ReviewWithRelations> {
    const review = await this.prisma.review.findFirst({
      where: { id, deletedAt: null },
      include: reviewWithRelationsInclude,
    });
    if (!review) {
      throw new ReviewNotFoundException(id);
    }
    return review;
  }

  private async ensurePlaceExists(placeId: string): Promise<void> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, status: ContentStatus.PUBLISHED },
      select: { id: true },
    });
    if (!place) {
      throw new PlaceNotFoundException(placeId);
    }
  }

  private getSubmissionStatus(role: Role): ContentStatus {
    const requireModeration = this.config.get<boolean>(
      'content.requireModeration',
      true,
    );
    return role === Role.USER && requireModeration
      ? ContentStatus.PENDING
      : ContentStatus.PUBLISHED;
  }

  private toResponse(
    review: ReviewWithRelations,
    metric?: TargetEngagement,
  ): ReviewResponseDto {
    return {
      ...review,
      commentCount: metric?.commentCount ?? 0,
      reactionCounts:
        metric?.reactionCounts ??
        ({
          LIKE: 0,
          LOVE: 0,
          WOW: 0,
          SAD: 0,
          ANGRY: 0,
        } as const),
    };
  }
}
