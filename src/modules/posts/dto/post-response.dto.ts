import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus, PostSource } from '@prisma/client';

import {
  PlaceSummaryResponseDto,
  ReactionCountsDto,
  SafeAuthorResponseDto,
} from '../../../common/dto/content-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class PostResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  placeId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({
    description: 'Short plain-text summary used in article previews',
  })
  description: string;

  @ApiProperty({ description: 'Complete sanitized HTML article body' })
  content: string;

  @ApiProperty({ enum: PostSource })
  source: PostSource;

  @ApiProperty({ enum: ContentStatus })
  status: ContentStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: SafeAuthorResponseDto })
  author: SafeAuthorResponseDto;

  @ApiPropertyOptional({ type: PlaceSummaryResponseDto, nullable: true })
  place: PlaceSummaryResponseDto | null;

  @ApiProperty()
  commentCount: number;

  @ApiProperty({ type: ReactionCountsDto })
  reactionCounts: ReactionCountsDto;
}

export class PaginatedPostsResponseDto {
  @ApiProperty({ type: [PostResponseDto] })
  items: PostResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class PostSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PostResponseDto })
  data: PostResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedPostsSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedPostsResponseDto })
  data: PaginatedPostsResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
