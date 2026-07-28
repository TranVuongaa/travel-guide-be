import { ApiProperty } from '@nestjs/swagger';

import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class PaginatedCategoriesResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  items: CategoryResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class CategorySuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: CategoryResponseDto })
  data: CategoryResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedCategoriesSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedCategoriesResponseDto })
  data: PaginatedCategoriesResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
