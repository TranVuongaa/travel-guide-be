import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationDto, SortOrder } from '../../../common/dto/pagination.dto';

export class QueryProvinceDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive and Vietnamese-accent-insensitive name/slug search',
    example: 'quang ninh',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.ASC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}
