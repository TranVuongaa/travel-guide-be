import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SafeAuthorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;
}

export class PlaceSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class ReactionCountsDto {
  @ApiProperty({ default: 0 })
  LIKE: number;

  @ApiProperty({ default: 0 })
  LOVE: number;

  @ApiProperty({ default: 0 })
  WOW: number;

  @ApiProperty({ default: 0 })
  SAD: number;

  @ApiProperty({ default: 0 })
  ANGRY: number;
}
