import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../../database/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { OAuthLinksController } from './oauth-links.controller';
import { AppleOAuthProvider } from './providers/apple-oauth.provider';
import { GoogleOAuthProvider } from './providers/google-oauth.provider';
import { OidcCryptoService } from './providers/oidc-crypto.service';
import { OAuthProvidersService } from './providers/oauth-providers.service';
import { OAuthRedirectValidatorService } from './providers/oauth-redirect-validator.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController, OAuthLinksController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtRefreshAuthGuard,
    OAuthRedirectValidatorService,
    OidcCryptoService,
    GoogleOAuthProvider,
    AppleOAuthProvider,
    OAuthProvidersService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
