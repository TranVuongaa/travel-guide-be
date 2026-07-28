import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh JWT returned by this API' })
  @IsString()
  @IsJWT()
  @MaxLength(4096)
  refreshToken: string;
}
