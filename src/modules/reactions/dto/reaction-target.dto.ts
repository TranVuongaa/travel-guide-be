import { ApiProperty } from '@nestjs/swagger';
import { ReactionTargetType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class ReactionTargetDto {
  @ApiProperty({ enum: ReactionTargetType })
  @IsEnum(ReactionTargetType)
  targetType: ReactionTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  targetId: string;
}
