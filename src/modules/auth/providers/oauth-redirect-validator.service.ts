import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OAuthProviderException } from '../../../common/exceptions/identity.exceptions';

@Injectable()
export class OAuthRedirectValidatorService {
  private readonly allowedRedirectUris: Set<string>;

  constructor(config: ConfigService) {
    this.allowedRedirectUris = new Set(
      config.getOrThrow<string[]>('auth.oauthAllowedRedirectUris'),
    );
  }

  assertAllowed(redirectUri: string): void {
    if (!this.allowedRedirectUris.has(redirectUri)) {
      throw new OAuthProviderException();
    }
  }
}
