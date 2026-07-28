import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentTargetType, ContentStatus } from '@prisma/client';

import {
  ReactionCountsDto,
  SafeAuthorResponseDto,
} from '../../../common/dto/content-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class CommentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  authorId: string | null;

  @ApiProperty({ enum: CommentTargetType })
  targetType: CommentTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  parentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  content: string | null;

  @ApiProperty({ enum: ContentStatus })
  status: ContentStatus;

  @ApiProperty()
  isDeleted: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: SafeAuthorResponseDto, nullable: true })
  author: SafeAuthorResponseDto | null;

  @ApiProperty()
  replyCount: number;

  @ApiProperty({ type: ReactionCountsDto })
  reactionCounts: ReactionCountsDto;
}

export class PaginatedCommentsResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items: CommentResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class CommentSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: CommentResponseDto })
  data: CommentResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedCommentsSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedCommentsResponseDto })
  data: PaginatedCommentsResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
