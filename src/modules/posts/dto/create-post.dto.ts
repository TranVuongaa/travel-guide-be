import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum PublicationIntent {
  DRAFT = 'DRAFT',
  SUBMIT = 'SUBMIT',
}

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePostDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ maxLength: 20000 })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  placeId?: string;

  @ApiProperty({ enum: PublicationIntent })
  @IsEnum(PublicationIntent)
  publicationIntent: PublicationIntent;
}
