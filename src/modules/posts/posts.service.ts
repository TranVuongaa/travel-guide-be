import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommentTargetType,
  ContentStatus,
  PostSource,
  Prisma,
  Role,
} from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { PostNotFoundException } from '../../common/exceptions/content.exceptions';
import { ForbiddenDomainException } from '../../common/exceptions/identity.exceptions';
import { PlaceNotFoundException } from '../../common/exceptions/place-not-found.exception';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  ContentEngagementService,
  TargetEngagement,
} from '../../common/services/content-engagement.service';
import { PrismaService } from '../../database/prisma.service';
import { CreatePostDto, PublicationIntent } from './dto/create-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { QueryMyPostDto, QueryPostDto } from './dto/query-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  postWithRelationsInclude,
  PostWithRelations,
} from './interfaces/post-with-relations.interface';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly engagement: ContentEngagementService,
  ) {}

  async findAll(
    query: QueryPostDto,
  ): Promise<PaginatedResult<PostResponseDto>> {
    const where: Prisma.PostWhereInput = {
      status: ContentStatus.PUBLISHED,
      deletedAt: null,
      ...(query.placeId ? { placeId: query.placeId } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                content: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    return this.findPage(where, query.page, query.limit, query.sortOrder);
  }

  async findMine(
    userId: string,
    query: QueryMyPostDto,
  ): Promise<PaginatedResult<PostResponseDto>> {
    return this.findPage(
      {
        authorId: userId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
      },
      query.page,
      query.limit,
      query.sortOrder,
    );
  }

  async findOneOrFail(id: string): Promise<PostResponseDto> {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      include: postWithRelationsInclude,
    });

    if (!post) {
      throw new PostNotFoundException(id);
    }

    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.POST,
      [id],
    );
    return this.toResponse(post, metrics.get(id));
  }

  async create(user: AuthUser, dto: CreatePostDto): Promise<PostResponseDto> {
    if (dto.placeId) {
      await this.ensurePlaceExists(dto.placeId);
    }

    const post = await this.prisma.post.create({
      data: {
        authorId: user.id,
        placeId: dto.placeId,
        title: dto.title,
        content: dto.content,
        source: this.getSource(user.role),
        status: this.getStatus(user.role, dto.publicationIntent),
      },
      include: postWithRelationsInclude,
    });

    return this.toResponse(post);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    this.ensureUpdateHasValues(dto);
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id) {
      throw new ForbiddenDomainException();
    }
    if (dto.placeId) {
      await this.ensurePlaceExists(dto.placeId);
    }

    let status = current.status;
    if (dto.publicationIntent) {
      status = this.getStatus(user.role, dto.publicationIntent);
    } else if (
      current.status === ContentStatus.PUBLISHED &&
      (dto.title !== undefined ||
        dto.content !== undefined ||
        dto.placeId !== undefined)
    ) {
      status = this.getStatus(user.role, PublicationIntent.SUBMIT);
    }

    const post = await this.prisma.post.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        placeId: dto.placeId,
        status,
      },
      include: postWithRelationsInclude,
    });
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.POST,
      [id],
    );
    return this.toResponse(post, metrics.get(id));
  }

  async remove(user: AuthUser, id: string): Promise<PostResponseDto> {
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenDomainException();
    }

    const post = await this.prisma.post.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: postWithRelationsInclude,
    });
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.POST,
      [id],
    );
    return this.toResponse(post, metrics.get(id));
  }

  private async findPage(
    where: Prisma.PostWhereInput,
    page: number,
    limit: number,
    sortOrder: SortOrder,
  ): Promise<PaginatedResult<PostResponseDto>> {
    const [posts, totalItems] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: sortOrder }, { id: sortOrder }],
        include: postWithRelationsInclude,
      }),
      this.prisma.post.count({ where }),
    ]);
    const metrics = await this.engagement.getTargetEngagement(
      CommentTargetType.POST,
      posts.map(({ id }) => id),
    );

    return {
      items: posts.map((post) => this.toResponse(post, metrics.get(post.id))),
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
  }

  private async findEditableOrFail(id: string): Promise<PostWithRelations> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: postWithRelationsInclude,
    });
    if (!post) {
      throw new PostNotFoundException(id);
    }
    return post;
  }

  private async ensurePlaceExists(placeId: string): Promise<void> {
    const place = await this.prisma.place.findFirst({
      where: {
        id: placeId,
        status: ContentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (!place) {
      throw new PlaceNotFoundException(placeId);
    }
  }

  private getSource(role: Role): PostSource {
    return role === Role.USER ? PostSource.USER : PostSource.SYSTEM;
  }

  private getStatus(
    role: Role,
    publicationIntent: PublicationIntent,
  ): ContentStatus {
    if (publicationIntent === PublicationIntent.DRAFT) {
      return ContentStatus.DRAFT;
    }
    const requireModeration = this.config.get<boolean>(
      'content.requireModeration',
      true,
    );
    return role === Role.USER && requireModeration
      ? ContentStatus.PENDING
      : ContentStatus.PUBLISHED;
  }

  private ensureUpdateHasValues(dto: UpdatePostDto): void {
    if (
      dto.title === undefined &&
      dto.content === undefined &&
      dto.placeId === undefined &&
      dto.publicationIntent === undefined
    ) {
      throw new BadRequestException('At least one field must be provided');
    }
  }

  private toResponse(
    post: PostWithRelations,
    metric?: TargetEngagement,
  ): PostResponseDto {
    return {
      ...post,
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
