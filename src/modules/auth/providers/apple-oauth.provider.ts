import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import {
  OAuthEmailRequiredException,
  OAuthProviderException,
} from '../../../common/exceptions/identity.exceptions';
import { AppleOAuthCodeDto } from '../dto/oauth-code.dto';
import {
  OAuthIdentity,
  OAuthProviderAdapter,
} from '../interfaces/oauth-identity.interface';
import { OidcCryptoService } from './oidc-crypto.service';
import { OAuthRedirectValidatorService } from './oauth-redirect-validator.service';

interface AppleTokenResponse {
  id_token?: string;
}

@Injectable()
export class AppleOAuthProvider implements OAuthProviderAdapter {
  private readonly clientId: string;
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: string;

  constructor(
    config: ConfigService,
    private readonly redirectValidator: OAuthRedirectValidatorService,
    private readonly oidcCrypto: OidcCryptoService,
  ) {
    this.clientId = config.getOrThrow<string>('auth.appleClientId');
    this.teamId = config.getOrThrow<string>('auth.appleTeamId');
    this.keyId = config.getOrThrow<string>('auth.appleKeyId');
    this.privateKey = config.getOrThrow<string>('auth.applePrivateKey');
  }

  async exchangeCode(dto: AppleOAuthCodeDto): Promise<OAuthIdentity> {
    if (dto.redirectUri) {
      this.redirectValidator.assertAllowed(dto.redirectUri);
    }

    try {
      const clientSecret = await this.createClientSecret();
      const body = new URLSearchParams({
        code: dto.authorizationCode,
        client_id: this.clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
      });
      if (dto.redirectUri) {
        body.set('redirect_uri', dto.redirectUri);
      }
      const response = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) {
        throw new OAuthProviderException();
      }

      const tokens = (await response.json()) as AppleTokenResponse;
      if (!tokens.id_token) {
        throw new OAuthProviderException();
      }

      const payload = await this.oidcCrypto.verifyApple(
        tokens.id_token,
        this.clientId,
      );
      const emailVerified =
        payload.email_verified === true || payload.email_verified === 'true';
      if (!payload.sub || typeof payload.email !== 'string' || !emailVerified) {
        throw new OAuthEmailRequiredException();
      }

      const displayName = [dto.givenName?.trim(), dto.familyName?.trim()]
        .filter(Boolean)
        .join(' ');

      return {
        provider: OAuthProvider.APPLE,
        providerAccountId: payload.sub,
        email: payload.email.trim().toLowerCase(),
        displayName: displayName || undefined,
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

  private async createClientSecret(): Promise<string> {
    return this.oidcCrypto.createAppleClientSecret({
      privateKey: this.privateKey,
      keyId: this.keyId,
      teamId: this.teamId,
      clientId: this.clientId,
    });
  }
}
