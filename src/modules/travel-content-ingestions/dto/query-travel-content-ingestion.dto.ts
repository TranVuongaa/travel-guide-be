import { ApiPropertyOptional } from '@nestjs/swagger';
import { TravelContentIngestionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryTravelContentIngestionDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TravelContentIngestionStatus })
  @IsOptional()
  @IsEnum(TravelContentIngestionStatus)
  status?: TravelContentIngestionStatus;
}
