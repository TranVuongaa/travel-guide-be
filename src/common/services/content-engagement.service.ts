import { Injectable } from '@nestjs/common';
import {
  CommentTargetType,
  ContentStatus,
  ReactionTargetType,
  ReactionType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

export interface TargetEngagement {
  commentCount: number;
  reactionCounts: Record<ReactionType, number>;
}

function emptyReactionCounts(): Record<ReactionType, number> {
  return {
    [ReactionType.LIKE]: 0,
    [ReactionType.LOVE]: 0,
    [ReactionType.WOW]: 0,
    [ReactionType.SAD]: 0,
    [ReactionType.ANGRY]: 0,
  };
}

@Injectable()
export class ContentEngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async getTargetEngagement(
    targetType: CommentTargetType,
    targetIds: string[],
  ): Promise<Map<string, TargetEngagement>> {
    const result = new Map(
      targetIds.map((id) => [
        id,
        { commentCount: 0, reactionCounts: emptyReactionCounts() },
      ]),
    );

    if (targetIds.length === 0) {
      return result;
    }

    const reactionTargetType =
      targetType === CommentTargetType.POST
        ? ReactionTargetType.POST
        : ReactionTargetType.REVIEW;
    const [comments, reactions] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where: {
          targetType,
          targetId: { in: targetIds },
          status: ContentStatus.PUBLISHED,
          deletedAt: null,
        },
        select: { targetId: true },
      }),
      this.prisma.reaction.findMany({
        where: {
          targetType: reactionTargetType,
          targetId: { in: targetIds },
        },
        select: { targetId: true, type: true },
      }),
    ]);

    comments.forEach(({ targetId }) => {
      const metric = result.get(targetId);
      if (metric) {
        metric.commentCount += 1;
      }
    });
    reactions.forEach(({ targetId, type }) => {
      const metric = result.get(targetId);
      if (metric) {
        metric.reactionCounts[type] += 1;
      }
    });

    return result;
  }

  async getCommentEngagement(
    commentIds: string[],
  ): Promise<Map<string, TargetEngagement>> {
    const result = new Map(
      commentIds.map((id) => [
        id,
        { commentCount: 0, reactionCounts: emptyReactionCounts() },
      ]),
    );

    if (commentIds.length === 0) {
      return result;
    }

    const [replies, reactions] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where: {
          parentId: { in: commentIds },
          status: ContentStatus.PUBLISHED,
        },
        select: { parentId: true },
      }),
      this.prisma.reaction.findMany({
        where: {
          targetType: ReactionTargetType.COMMENT,
          targetId: { in: commentIds },
        },
        select: { targetId: true, type: true },
      }),
    ]);

    replies.forEach(({ parentId }) => {
      if (!parentId) {
        return;
      }
      const metric = result.get(parentId);
      if (metric) {
        metric.commentCount += 1;
      }
    });
    reactions.forEach(({ targetId, type }) => {
      const metric = result.get(targetId);
      if (metric) {
        metric.reactionCounts[type] += 1;
      }
    });

    return result;
  }
}
