import { ApiProperty } from '@nestjs/swagger';
import { ReactionTargetType, ReactionType } from '@prisma/client';

import { ReactionCountsDto } from '../../../common/dto/content-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export enum ReactionMutationOutcome {
  CREATED = 'CREATED',
  UNCHANGED = 'UNCHANGED',
  UPDATED = 'UPDATED',
}

export class ReactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: ReactionTargetType })
  targetType: ReactionTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty({ enum: ReactionType })
  type: ReactionType;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class ReactionMutationResponseDto {
  @ApiProperty({ enum: ReactionMutationOutcome })
  outcome: ReactionMutationOutcome;

  @ApiProperty({ type: ReactionResponseDto })
  reaction: ReactionResponseDto;
}

export class ReactionSummaryResponseDto {
  @ApiProperty({ enum: ReactionTargetType })
  targetType: ReactionTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: ReactionCountsDto })
  counts: ReactionCountsDto;
}

export class ReactionMutationSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReactionMutationResponseDto })
  data: ReactionMutationResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class ReactionSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReactionResponseDto })
  data: ReactionResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class ReactionSummarySuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReactionSummaryResponseDto })
  data: ReactionSummaryResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
