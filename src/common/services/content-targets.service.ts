import { Injectable } from '@nestjs/common';
import {
  CommentTargetType,
  ContentStatus,
  ReactionTargetType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentTargetNotFoundException } from '../exceptions/content.exceptions';

type ContentTargetType = CommentTargetType | ReactionTargetType;

@Injectable()
export class ContentTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePublishedTarget(
    targetType: ContentTargetType,
    targetId: string,
  ): Promise<void> {
    const where = {
      id: targetId,
      status: ContentStatus.PUBLISHED,
      deletedAt: null,
    };
    let target: { id: string } | null = null;

    switch (targetType) {
      case ReactionTargetType.POST:
        target = await this.prisma.post.findFirst({
          where,
          select: { id: true },
        });
        break;
      case ReactionTargetType.REVIEW:
        target = await this.prisma.review.findFirst({
          where,
          select: { id: true },
        });
        break;
      case ReactionTargetType.COMMENT:
        target = await this.prisma.comment.findFirst({
          where,
          select: { id: true },
        });
        break;
    }

    if (!target) {
      throw new ContentTargetNotFoundException();
    }
  }
}
