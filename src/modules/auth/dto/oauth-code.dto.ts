import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AuthorizationCodeDto {
  @ApiProperty({ description: 'One-time provider authorization code' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  authorizationCode: string;

  @ApiProperty({
    description:
      'Exact redirect URI used when obtaining the authorization code',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  redirectUri: string;
}

export class OAuthCodeDto extends AuthorizationCodeDto {
  @ApiProperty({
    description: 'PKCE code verifier used by the client',
    minLength: 43,
    maxLength: 128,
  })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9\-._~]+$/)
  codeVerifier: string;
}

export class AppleOAuthCodeDto {
  @ApiProperty({ description: 'One-time Apple authorization code' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  authorizationCode: string;

  @ApiPropertyOptional({
    description:
      'Exact HTTPS redirect URI used by Apple web login; omit for native login when none was sent',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  redirectUri?: string;

  @ApiPropertyOptional({
    description:
      'Given name returned only during the first Apple authorization',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  givenName?: string;

  @ApiPropertyOptional({
    description:
      'Family name returned only during the first Apple authorization',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyName?: string;
}
