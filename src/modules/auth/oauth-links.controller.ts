import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OAuthProvider } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { UserSuccessResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { AppleOAuthCodeDto, OAuthCodeDto } from './dto/oauth-code.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users/me/oauth', version: '1' })
export class OAuthLinksController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Link Google to the current account' })
  @ApiOkResponse({ type: UserSuccessResponseDto })
  linkGoogle(@CurrentUser() user: AuthUser, @Body() dto: OAuthCodeDto) {
    return this.authService.linkOAuth(user.id, OAuthProvider.GOOGLE, dto);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Link Apple to the current account' })
  @ApiOkResponse({ type: UserSuccessResponseDto })
  linkApple(@CurrentUser() user: AuthUser, @Body() dto: AppleOAuthCodeDto) {
    return this.authService.linkOAuth(user.id, OAuthProvider.APPLE, dto);
  }

  @Delete(':provider')
  @ApiOperation({
    summary: 'Unlink a social provider from the current account',
  })
  @ApiOkResponse({ type: UserSuccessResponseDto })
  unlink(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(OAuthProvider))
    provider: OAuthProvider,
  ) {
    return this.authService.unlinkOAuth(user.id, provider);
  }
}
