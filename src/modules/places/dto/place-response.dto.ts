import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';

import { EntityImageResponseDto } from '../../../common/dto/entity-image-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class ProvinceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class PlaceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  latitude: number | null;

  @ApiPropertyOptional({ nullable: true })
  longitude: number | null;

  @ApiProperty({ format: 'uuid' })
  provinceId: string;

  @ApiProperty()
  avgRating: number;

  @ApiProperty()
  reviewCount: number;

  @ApiProperty({ enum: ContentStatus })
  status: ContentStatus;

  @ApiProperty()
  createdById: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: ProvinceResponseDto })
  province: ProvinceResponseDto;

  @ApiProperty({ type: [CategoryResponseDto] })
  categories: CategoryResponseDto[];

  @ApiProperty({ type: [EntityImageResponseDto] })
  images: EntityImageResponseDto[];
}

export class PaginatedPlacesResponseDto {
  @ApiProperty({ type: [PlaceResponseDto] })
  items: PlaceResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class PlaceSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PlaceResponseDto })
  data: PlaceResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedPlacesSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedPlacesResponseDto })
  data: PaginatedPlacesResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
