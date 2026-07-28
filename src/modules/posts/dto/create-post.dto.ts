import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  @ApiProperty({
    description: 'Short plain-text summary used in article previews',
    example: 'A practical two-day itinerary for exploring Ha Long Bay.',
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^<>]*$/u, {
    message: 'description must be plain text without HTML tags',
  })
  @MaxLength(500)
  description: string;

  @ApiProperty({
    description: 'Complete article body as sanitized HTML',
    example:
      '<p>Spend the first morning cruising between the limestone islands.</p>',
    maxLength: 100000,
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  content: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  placeId?: string;

  @ApiProperty({ enum: PublicationIntent })
  @IsEnum(PublicationIntent)
  publicationIntent: PublicationIntent;
}
