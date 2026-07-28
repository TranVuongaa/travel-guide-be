import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';

import {
  PlaceSummaryResponseDto,
  ReactionCountsDto,
  SafeAuthorResponseDto,
} from '../../../common/dto/content-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  placeId: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating: number;

  @ApiPropertyOptional({ nullable: true })
  content: string | null;

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

  @ApiProperty({ type: PlaceSummaryResponseDto })
  place: PlaceSummaryResponseDto;

  @ApiProperty()
  commentCount: number;

  @ApiProperty({ type: ReactionCountsDto })
  reactionCounts: ReactionCountsDto;
}

export class PaginatedReviewsResponseDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  items: ReviewResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class ReviewSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ReviewResponseDto })
  data: ReviewResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedReviewsSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedReviewsResponseDto })
  data: PaginatedReviewsResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
