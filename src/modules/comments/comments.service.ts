import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentStatus, Prisma, Role } from '@prisma/client';

import {
  CommentMaxDepthException,
  CommentNotFoundException,
  CommentParentTargetMismatchException,
} from '../../common/exceptions/content.exceptions';
import { ForbiddenDomainException } from '../../common/exceptions/identity.exceptions';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  ContentEngagementService,
  TargetEngagement,
} from '../../common/services/content-engagement.service';
import { ContentTargetsService } from '../../common/services/content-targets.service';
import { PrismaService } from '../../database/prisma.service';
import { CommentResponseDto } from './dto/comment-response.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { QueryCommentDto } from './dto/query-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  commentWithAuthorInclude,
  CommentWithAuthor,
} from './interfaces/comment-with-author.interface';

const MAX_COMMENT_DEPTH = 5;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly targets: ContentTargetsService,
    private readonly engagement: ContentEngagementService,
  ) {}

  async findAll(
    query: QueryCommentDto,
  ): Promise<PaginatedResult<CommentResponseDto>> {
    await this.targets.ensurePublishedTarget(query.targetType, query.targetId);
    if (query.parentId) {
      await this.ensurePublicParent(query);
    }
    const where: Prisma.CommentWhereInput = {
      targetType: query.targetType,
      targetId: query.targetId,
      parentId: query.parentId ?? null,
      status: ContentStatus.PUBLISHED,
      OR: [
        { deletedAt: null },
        {
          replies: {
            some: { status: ContentStatus.PUBLISHED },
          },
        },
      ],
    };
    const [comments, totalItems] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
        include: commentWithAuthorInclude,
      }),
      this.prisma.comment.count({ where }),
    ]);
    const metrics = await this.engagement.getCommentEngagement(
      comments.map(({ id }) => id),
    );

    return {
      items: comments.map((comment) =>
        this.toResponse(comment, metrics.get(comment.id)),
      ),
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async findOneOrFail(id: string): Promise<CommentResponseDto> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, status: ContentStatus.PUBLISHED },
      include: commentWithAuthorInclude,
    });
    if (!comment) {
      throw new CommentNotFoundException(id);
    }
    await this.targets.ensurePublishedTarget(
      comment.targetType,
      comment.targetId,
    );
    const metrics = await this.engagement.getCommentEngagement([id]);
    const metric = metrics.get(id);
    if (comment.deletedAt && !metric?.commentCount) {
      throw new CommentNotFoundException(id);
    }
    return this.toResponse(comment, metric);
  }

  async create(
    user: AuthUser,
    dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    await this.targets.ensurePublishedTarget(dto.targetType, dto.targetId);
    if (dto.parentId) {
      await this.validateParent(dto);
    }

    const comment = await this.prisma.comment.create({
      data: {
        authorId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        parentId: dto.parentId,
        content: dto.content,
        status: this.getSubmissionStatus(user.role),
      },
      include: commentWithAuthorInclude,
    });
    return this.toResponse(comment);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateCommentDto,
  ): Promise<CommentResponseDto> {
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id) {
      throw new ForbiddenDomainException();
    }

    const comment = await this.prisma.comment.update({
      where: { id },
      data: {
        content: dto.content,
        status: this.getSubmissionStatus(user.role),
      },
      include: commentWithAuthorInclude,
    });
    const metrics = await this.engagement.getCommentEngagement([id]);
    return this.toResponse(comment, metrics.get(id));
  }

  async remove(user: AuthUser, id: string): Promise<CommentResponseDto> {
    const current = await this.findEditableOrFail(id);
    if (current.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenDomainException();
    }

    const comment = await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: commentWithAuthorInclude,
    });
    const metrics = await this.engagement.getCommentEngagement([id]);
    return this.toResponse(comment, metrics.get(id));
  }

  private async ensurePublicParent(query: QueryCommentDto): Promise<void> {
    const parent = await this.prisma.comment.findFirst({
      where: {
        id: query.parentId,
        targetType: query.targetType,
        targetId: query.targetId,
        status: ContentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (!parent) {
      throw new CommentNotFoundException(query.parentId as string);
    }
  }

  private async validateParent(dto: CreateCommentDto): Promise<void> {
    const parent = await this.prisma.comment.findFirst({
      where: {
        id: dto.parentId,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        parentId: true,
      },
    });
    if (!parent) {
      throw new CommentNotFoundException(dto.parentId as string);
    }
    if (
      parent.targetType !== dto.targetType ||
      parent.targetId !== dto.targetId
    ) {
      throw new CommentParentTargetMismatchException();
    }

    let currentParent = parent;
    let depth = 2;
    while (currentParent.parentId) {
      if (depth >= MAX_COMMENT_DEPTH) {
        throw new CommentMaxDepthException();
      }
      const ancestorId = currentParent.parentId;
      const ancestor = await this.prisma.comment.findUnique({
        where: { id: ancestorId },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          parentId: true,
        },
      });
      if (!ancestor) {
        throw new CommentNotFoundException(ancestorId);
      }
      currentParent = ancestor;
      depth += 1;
    }
  }

  private async findEditableOrFail(id: string): Promise<CommentWithAuthor> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: commentWithAuthorInclude,
    });
    if (!comment) {
      throw new CommentNotFoundException(id);
    }
    return comment;
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
    comment: CommentWithAuthor,
    metric?: TargetEngagement,
  ): CommentResponseDto {
    const isDeleted = comment.deletedAt !== null;
    return {
      ...comment,
      authorId: isDeleted ? null : comment.authorId,
      content: isDeleted ? null : comment.content,
      author: isDeleted ? null : comment.author,
      isDeleted,
      replyCount: metric?.commentCount ?? 0,
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
