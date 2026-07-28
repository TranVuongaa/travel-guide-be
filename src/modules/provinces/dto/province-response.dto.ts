import { ApiProperty } from '@nestjs/swagger';

import { EntityImageResponseDto } from '../../../common/dto/entity-image-response.dto';
import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';

export class ProvinceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: [EntityImageResponseDto] })
  images: EntityImageResponseDto[];
}

export class PaginatedProvincesResponseDto {
  @ApiProperty({ type: [ProvinceResponseDto] })
  items: ProvinceResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  totalPages: number;
}

export class ProvinceSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: ProvinceResponseDto })
  data: ProvinceResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}

export class PaginatedProvincesSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: PaginatedProvincesResponseDto })
  data: PaginatedProvincesResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
