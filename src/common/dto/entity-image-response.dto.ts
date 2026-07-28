import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EntityImageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uri' })
  url: string;

  @ApiProperty({ format: 'uri' })
  sourcePageUrl: string;

  @ApiProperty()
  altText: string;

  @ApiPropertyOptional({ nullable: true })
  author: string | null;

  @ApiProperty()
  licenseName: string;

  @ApiPropertyOptional({ format: 'uri', nullable: true })
  licenseUrl: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  width: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  height: number | null;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;
}
