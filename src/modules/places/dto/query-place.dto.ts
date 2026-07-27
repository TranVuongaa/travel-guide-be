import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum PlaceSortBy {
  AVG_RATING = 'avgRating',
  CREATED_AT = 'createdAt',
  NAME = 'name',
  UPDATED_AT = 'updatedAt',
}

export class QueryPlaceDto extends PaginationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  provinceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    enum: PlaceSortBy,
    default: PlaceSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(PlaceSortBy)
  sortBy: PlaceSortBy = PlaceSortBy.CREATED_AT;
}
