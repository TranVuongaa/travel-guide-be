import { Prisma, ReactionTargetType, ReactionType } from '@prisma/client';

import { ReactionNotFoundException } from '../../common/exceptions/content.exceptions';
import { ContentTargetsService } from '../../common/services/content-targets.service';
import { PrismaService } from '../../database/prisma.service';
import { ReactionMutationOutcome } from './dto/reaction-response.dto';
import { ReactionsService } from './reactions.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const REACTION_ID = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const reaction = {
  id: REACTION_ID,
  userId: USER_ID,
  targetType: ReactionTargetType.POST,
  targetId: TARGET_ID,
  type: ReactionType.LIKE,
  createdAt,
  updatedAt: createdAt,
};

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database error', {
    code,
    clientVersion: 'test',
  });
}

describe('ReactionsService', () => {
  let service: ReactionsService;
  let prisma: {
    reaction: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let targets: { ensurePublishedTarget: jest.Mock };

  beforeEach(() => {
    prisma = {
      reaction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    targets = { ensurePublishedTarget: jest.fn().mockResolvedValue(undefined) };
    service = new ReactionsService(
      prisma as unknown as PrismaService,
      targets as unknown as ContentTargetsService,
    );
  });

  it('should summarize reactions by type', async () => {
    prisma.reaction.findMany.mockResolvedValue([
      { type: ReactionType.LIKE },
      { type: ReactionType.LIKE },
      { type: ReactionType.LOVE },
    ]);

    const result = await service.getSummary({
      targetType: ReactionTargetType.POST,
      targetId: TARGET_ID,
    });

    expect(result.total).toBe(3);
    expect(result.counts.LIKE).toBe(2);
    expect(result.counts.LOVE).toBe(1);
  });

  it('should return unchanged for the same existing reaction', async () => {
    prisma.reaction.findUnique.mockResolvedValue(reaction);

    const result = await service.upsert(USER_ID, {
      targetType: ReactionTargetType.POST,
      targetId: TARGET_ID,
      type: ReactionType.LIKE,
    });

    expect(result.outcome).toBe(ReactionMutationOutcome.UNCHANGED);
    expect(prisma.reaction.update).not.toHaveBeenCalled();
  });

  it('should change the type of an existing reaction', async () => {
    prisma.reaction.findUnique.mockResolvedValue(reaction);
    prisma.reaction.update.mockResolvedValue({
      ...reaction,
      type: ReactionType.LOVE,
    });

    const result = await service.upsert(USER_ID, {
      targetType: ReactionTargetType.POST,
      targetId: TARGET_ID,
      type: ReactionType.LOVE,
    });

    expect(result.outcome).toBe(ReactionMutationOutcome.UPDATED);
  });

  it('should create a new reaction', async () => {
    prisma.reaction.findUnique.mockResolvedValue(null);
    prisma.reaction.create.mockResolvedValue(reaction);

    const result = await service.upsert(USER_ID, {
      targetType: ReactionTargetType.POST,
      targetId: TARGET_ID,
      type: ReactionType.LIKE,
    });

    expect(result.outcome).toBe(ReactionMutationOutcome.CREATED);
  });

  it('should converge concurrent creates onto the compound unique row', async () => {
    prisma.reaction.findUnique.mockResolvedValue(null);
    prisma.reaction.create.mockRejectedValue(prismaError('P2002'));
    prisma.reaction.update.mockResolvedValue(reaction);

    const result = await service.upsert(USER_ID, {
      targetType: ReactionTargetType.POST,
      targetId: TARGET_ID,
      type: ReactionType.LIKE,
    });

    expect(result.outcome).toBe(ReactionMutationOutcome.UPDATED);
    expect(prisma.reaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_targetType_targetId: {
            userId: USER_ID,
            targetType: ReactionTargetType.POST,
            targetId: TARGET_ID,
          },
        },
      }),
    );
  });

  it('should delete only the current user reaction', async () => {
    prisma.reaction.findUnique.mockResolvedValue(reaction);
    prisma.reaction.delete.mockResolvedValue(reaction);

    await expect(
      service.remove(USER_ID, {
        targetType: ReactionTargetType.POST,
        targetId: TARGET_ID,
      }),
    ).resolves.toEqual(reaction);
  });

  it('should reject removal when no reaction exists', async () => {
    prisma.reaction.findUnique.mockResolvedValue(null);

    await expect(
      service.remove(USER_ID, {
        targetType: ReactionTargetType.POST,
        targetId: TARGET_ID,
      }),
    ).rejects.toBeInstanceOf(ReactionNotFoundException);
  });
});
