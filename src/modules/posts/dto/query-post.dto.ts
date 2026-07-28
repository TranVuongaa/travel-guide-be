import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus, PostSource } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryPostDto extends PaginationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  placeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  authorId?: string;

  @ApiPropertyOptional({
    enum: PostSource,
    description: 'Post source filter; an empty value applies no source filter',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsEnum(PostSource)
  source?: PostSource;

  @ApiPropertyOptional({
    description:
      'Case-insensitive and Vietnamese-accent-insensitive title, description, or visible article text search',
    example: 'co do hue',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class QueryMyPostDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
