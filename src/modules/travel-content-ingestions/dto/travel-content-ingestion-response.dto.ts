import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TravelContentIngestionStatus } from '@prisma/client';

import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class TravelContentIngestionRunResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: TravelContentIngestionStatus })
  status: TravelContentIngestionStatus;

  @ApiProperty({ type: 'object', additionalProperties: true })
  requestParameters: Record<string, unknown>;

  @ApiProperty()
  isTerminal: boolean;

  @ApiPropertyOptional({ nullable: true, example: 3000 })
  pollAfterMs: number | null;

  @ApiProperty()
  trendKeywordCount: number;

  @ApiProperty()
  discoveredUrlCount: number;

  @ApiProperty()
  importedPostCount: number;

  @ApiProperty()
  duplicateCount: number;

  @ApiProperty()
  skippedCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiPropertyOptional({ nullable: true })
  errorSummary: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  startedAt: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt: Date | null;
}

export class PaginatedTravelContentIngestionRunsDto {
  @ApiProperty({ type: [TravelContentIngestionRunResponseDto] })
  items: TravelContentIngestionRunResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class TravelContentIngestionSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: TravelContentIngestionRunResponseDto })
  data: TravelContentIngestionRunResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedTravelContentIngestionsSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedTravelContentIngestionRunsDto })
  data: PaginatedTravelContentIngestionRunsDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class TravelContentIngestionAcceptedResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: TravelContentIngestionRunResponseDto })
  data: TravelContentIngestionRunResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
