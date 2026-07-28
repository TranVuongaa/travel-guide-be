import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { PublicationIntent } from './create-post.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Short plain-text summary used in article previews',
    example: 'An updated practical itinerary for Ha Long Bay.',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^<>]*$/u, {
    message: 'description must be plain text without HTML tags',
  })
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Complete article body as sanitized HTML',
    example: '<p>Begin the updated itinerary at Tuan Chau Marina.</p>',
    maxLength: 100000,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  content?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID('4')
  placeId?: string | null;

  @ApiPropertyOptional({ enum: PublicationIntent })
  @IsOptional()
  @IsEnum(PublicationIntent)
  publicationIntent?: PublicationIntent;
}
