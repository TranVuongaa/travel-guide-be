import {
  CommentTargetType,
  ReactionTargetType,
  ReactionType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentEngagementService } from './content-engagement.service';

const TARGET_ID = '11111111-1111-4111-8111-111111111111';

describe('ContentEngagementService', () => {
  let service: ContentEngagementService;
  let prisma: {
    comment: { findMany: jest.Mock };
    reaction: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      comment: { findMany: jest.fn() },
      reaction: { findMany: jest.fn() },
      $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
    };
    service = new ContentEngagementService(prisma as unknown as PrismaService);
  });

  it('should batch post comment and reaction metrics', async () => {
    prisma.comment.findMany.mockResolvedValue([
      { targetId: TARGET_ID },
      { targetId: TARGET_ID },
    ]);
    prisma.reaction.findMany.mockResolvedValue([
      { targetId: TARGET_ID, type: ReactionType.LIKE },
    ]);

    const result = await service.getTargetEngagement(CommentTargetType.POST, [
      TARGET_ID,
    ]);

    const metric = result.get(TARGET_ID);
    expect(metric?.commentCount).toBe(2);
    expect(metric?.reactionCounts.LIKE).toBe(1);
    const reactionCalls = prisma.reaction.findMany.mock.calls as unknown as [
      [{ where: { targetType: ReactionTargetType } }],
    ];
    const reactionArgs = reactionCalls[0][0];
    expect(reactionArgs.where.targetType).toBe(ReactionTargetType.POST);
  });

  it('should batch reply and comment-reaction metrics', async () => {
    prisma.comment.findMany.mockResolvedValue([{ parentId: TARGET_ID }]);
    prisma.reaction.findMany.mockResolvedValue([
      { targetId: TARGET_ID, type: ReactionType.LOVE },
    ]);

    const result = await service.getCommentEngagement([TARGET_ID]);

    const metric = result.get(TARGET_ID);
    expect(metric?.commentCount).toBe(1);
    expect(metric?.reactionCounts.LOVE).toBe(1);
  });

  it('should avoid database work for an empty target batch', async () => {
    await expect(service.getCommentEngagement([])).resolves.toEqual(new Map());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
