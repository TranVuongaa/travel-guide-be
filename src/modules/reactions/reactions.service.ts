import { Injectable } from '@nestjs/common';
import { Prisma, Reaction, ReactionType } from '@prisma/client';

import { ReactionNotFoundException } from '../../common/exceptions/content.exceptions';
import { ContentTargetsService } from '../../common/services/content-targets.service';
import { PrismaService } from '../../database/prisma.service';
import {
  ReactionMutationOutcome,
  ReactionMutationResponseDto,
  ReactionSummaryResponseDto,
} from './dto/reaction-response.dto';
import { ReactionTargetDto } from './dto/reaction-target.dto';
import { UpsertReactionDto } from './dto/upsert-reaction.dto';

function emptyCounts(): Record<ReactionType, number> {
  return {
    [ReactionType.LIKE]: 0,
    [ReactionType.LOVE]: 0,
    [ReactionType.WOW]: 0,
    [ReactionType.SAD]: 0,
    [ReactionType.ANGRY]: 0,
  };
}

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ContentTargetsService,
  ) {}

  async getSummary(
    dto: ReactionTargetDto,
  ): Promise<ReactionSummaryResponseDto> {
    await this.targets.ensurePublishedTarget(dto.targetType, dto.targetId);
    const reactions = await this.prisma.reaction.findMany({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
      select: { type: true },
    });
    const counts = emptyCounts();
    reactions.forEach(({ type }) => {
      counts[type] += 1;
    });

    return {
      targetType: dto.targetType,
      targetId: dto.targetId,
      total: reactions.length,
      counts,
    };
  }

  async upsert(
    userId: string,
    dto: UpsertReactionDto,
  ): Promise<ReactionMutationResponseDto> {
    await this.targets.ensurePublishedTarget(dto.targetType, dto.targetId);
    const compoundId = {
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
    };
    const existing = await this.prisma.reaction.findUnique({
      where: { userId_targetType_targetId: compoundId },
    });

    if (existing?.type === dto.type) {
      return {
        outcome: ReactionMutationOutcome.UNCHANGED,
        reaction: existing,
      };
    }
    if (existing) {
      const reaction = await this.prisma.reaction.update({
        where: { id: existing.id },
        data: { type: dto.type },
      });
      return {
        outcome: ReactionMutationOutcome.UPDATED,
        reaction,
      };
    }

    try {
      const reaction = await this.prisma.reaction.create({
        data: { userId, ...dto },
      });
      return {
        outcome: ReactionMutationOutcome.CREATED,
        reaction,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.updateAfterCreateRace(userId, dto);
      }
      throw error;
    }
  }

  async remove(userId: string, dto: ReactionTargetDto): Promise<Reaction> {
    await this.targets.ensurePublishedTarget(dto.targetType, dto.targetId);
    const existing = await this.prisma.reaction.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
    });
    if (!existing) {
      throw new ReactionNotFoundException();
    }
    return this.prisma.reaction.delete({ where: { id: existing.id } });
  }

  private async updateAfterCreateRace(
    userId: string,
    dto: UpsertReactionDto,
  ): Promise<ReactionMutationResponseDto> {
    const reaction = await this.prisma.reaction.update({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      data: { type: dto.type },
    });
    return {
      outcome: ReactionMutationOutcome.UPDATED,
      reaction,
    };
  }
}
