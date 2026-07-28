import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OAuthProvider } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';

import { CurrentRefreshUser } from '../../common/decorators/current-refresh-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type {
  AuthUser,
  RefreshAuthUser,
} from '../../common/interfaces/auth-user.interface';
import { AuthService } from './auth.service';
import { AuthSuccessResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { AppleOAuthCodeDto, OAuthCodeDto } from './dto/oauth-code.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Register with email and password' })
  @ApiCreatedResponse({ type: AuthSuccessResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credentials are invalid' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @Public()
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Log in or register with Google OAuth' })
  @ApiOkResponse({ type: AuthSuccessResponseDto })
  @ApiConflictResponse({ description: 'Explicit account linking is required' })
  google(@Body() dto: OAuthCodeDto) {
    return this.authService.socialLogin(OAuthProvider.GOOGLE, dto);
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @Public()
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Log in or register with Apple OAuth' })
  @ApiOkResponse({ type: AuthSuccessResponseDto })
  @ApiConflictResponse({ description: 'Explicit account linking is required' })
  apple(@Body() dto: AppleOAuthCodeDto) {
    return this.authService.socialLogin(OAuthProvider.APPLE, dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Throttle({ auth: {} })
  @ApiOperation({ summary: 'Rotate a refresh token' })
  @ApiOkResponse({ type: AuthSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid' })
  refresh(
    @CurrentRefreshUser() user: RefreshAuthUser,
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(user, dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @ApiOperation({ summary: 'Revoke the presented refresh session' })
  @ApiOkResponse({ description: 'The session was revoked' })
  logout(
    @CurrentRefreshUser() user: RefreshAuthUser,
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.logout(user, dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke every refresh session for the current user',
  })
  @ApiOkResponse({ description: 'All sessions were revoked' })
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user.id);
  }
}
