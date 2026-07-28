import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '@prisma/client';
import { IsEnum } from 'class-validator';

import { ReactionTargetDto } from './reaction-target.dto';

export class UpsertReactionDto extends ReactionTargetDto {
  @ApiProperty({ enum: ReactionType })
  @IsEnum(ReactionType)
  type: ReactionType;
}
