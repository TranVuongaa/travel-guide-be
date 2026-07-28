import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import {
  OAuthEmailRequiredException,
  OAuthProviderException,
} from '../../../common/exceptions/identity.exceptions';
import { OAuthCodeDto } from '../dto/oauth-code.dto';
import {
  OAuthIdentity,
  OAuthProviderAdapter,
} from '../interfaces/oauth-identity.interface';
import { OidcCryptoService } from './oidc-crypto.service';
import { OAuthRedirectValidatorService } from './oauth-redirect-validator.service';

interface GoogleTokenResponse {
  id_token?: string;
}

@Injectable()
export class GoogleOAuthProvider implements OAuthProviderAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    config: ConfigService,
    private readonly redirectValidator: OAuthRedirectValidatorService,
    private readonly oidcCrypto: OidcCryptoService,
  ) {
    this.clientId = config.getOrThrow<string>('auth.googleClientId');
    this.clientSecret = config.getOrThrow<string>('auth.googleClientSecret');
  }

  async exchangeCode(dto: OAuthCodeDto): Promise<OAuthIdentity> {
    this.redirectValidator.assertAllowed(dto.redirectUri);

    try {
      const body = new URLSearchParams({
        code: dto.authorizationCode,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: dto.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: dto.codeVerifier,
      });
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) {
        throw new OAuthProviderException();
      }

      const tokens = (await response.json()) as GoogleTokenResponse;
      if (!tokens.id_token) {
        throw new OAuthProviderException();
      }

      const payload = await this.oidcCrypto.verifyGoogle(
        tokens.id_token,
        this.clientId,
      );
      if (
        !payload.sub ||
        typeof payload.email !== 'string' ||
        payload.email_verified !== true
      ) {
        throw new OAuthEmailRequiredException();
      }

      return {
        provider: OAuthProvider.GOOGLE,
        providerAccountId: payload.sub,
        email: payload.email.trim().toLowerCase(),
        displayName:
          typeof payload.name === 'string' ? payload.name.trim() : undefined,
        avatarUrl:
          typeof payload.picture === 'string' ? payload.picture : undefined,
      };
    } catch (error) {
      if (
        error instanceof OAuthEmailRequiredException ||
        error instanceof OAuthProviderException
      ) {
        throw error;
      }
      throw new OAuthProviderException();
    }
  }
}
