import { ApiProperty } from '@nestjs/swagger';

import { ResponseMetaDto } from '../../../common/dto/response-meta.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 900 })
  accessTokenExpiresIn: number;
}

export class AuthSuccessResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ type: AuthResponseDto })
  data: AuthResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  meta: ResponseMetaDto;
}
