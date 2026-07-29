import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePlaceDto {
  @ApiProperty({ example: 'Ha Long Bay', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Short plain-text destination summary',
    example: 'A UNESCO World Heritage destination.',
    maxLength: 10000,
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^<>]*$/u, {
    message: 'description must be plain text without HTML tags',
  })
  @MaxLength(10000)
  description: string;

  @ApiProperty({
    description: 'Complete destination body as sanitized HTML',
    example:
      '<h2>Overview</h2><p>Explore limestone islands and emerald water.</p>',
    maxLength: 100000,
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  content: string;

  @ApiPropertyOptional({ example: 'Quang Ninh, Vietnam', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 20.9101, minimum: -90, maximum: 90 })
  @ValidateIf(
    (object: CreatePlaceDto) =>
      object.latitude !== undefined || object.longitude !== undefined,
  )
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 107.1839, minimum: -180, maximum: 180 })
  @ValidateIf(
    (object: CreatePlaceDto) =>
      object.latitude !== undefined || object.longitude !== undefined,
  )
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  provinceId: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
