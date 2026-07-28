import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentTargetType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryCommentDto extends PaginationDto {
  @ApiProperty({ enum: CommentTargetType })
  @IsEnum(CommentTargetType)
  targetType: CommentTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  targetId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
