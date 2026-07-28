import { CommentTargetType, ReactionTargetType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentTargetNotFoundException } from '../exceptions/content.exceptions';
import { ContentTargetsService } from './content-targets.service';

const TARGET_ID = '11111111-1111-4111-8111-111111111111';

describe('ContentTargetsService', () => {
  let service: ContentTargetsService;
  let prisma: {
    post: { findFirst: jest.Mock };
    review: { findFirst: jest.Mock };
    comment: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      post: { findFirst: jest.fn() },
      review: { findFirst: jest.fn() },
      comment: { findFirst: jest.fn() },
    };
    service = new ContentTargetsService(prisma as unknown as PrismaService);
  });

  it.each([
    [ReactionTargetType.POST, 'post'],
    [ReactionTargetType.REVIEW, 'review'],
    [ReactionTargetType.COMMENT, 'comment'],
  ] as const)(
    'should validate a published %s target',
    async (targetType, model) => {
      prisma[model].findFirst.mockResolvedValue({ id: TARGET_ID });

      await expect(
        service.ensurePublishedTarget(targetType, TARGET_ID),
      ).resolves.toBeUndefined();
    },
  );

  it('should reject a missing target without leaking its type', async () => {
    prisma.post.findFirst.mockResolvedValue(null);

    await expect(
      service.ensurePublishedTarget(CommentTargetType.POST, TARGET_ID),
    ).rejects.toBeInstanceOf(ContentTargetNotFoundException);
  });
});
