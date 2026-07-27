import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreatePlaceDto {
  @ApiProperty({ example: 'Ha Long Bay', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'A UNESCO World Heritage destination.' })
  @IsString()
  @MaxLength(10000)
  description: string;

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
