import { Injectable } from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';

import { OAuthProviderException } from '../../../common/exceptions/identity.exceptions';
import { OAuthCodeDto } from '../dto/oauth-code.dto';
import {
  OAuthIdentity,
  ProviderOAuthCodeDto,
} from '../interfaces/oauth-identity.interface';
import { AppleOAuthProvider } from './apple-oauth.provider';
import { GoogleOAuthProvider } from './google-oauth.provider';

@Injectable()
export class OAuthProvidersService {
  constructor(
    private readonly google: GoogleOAuthProvider,
    private readonly apple: AppleOAuthProvider,
  ) {}

  exchangeCode(
    provider: OAuthProvider,
    dto: ProviderOAuthCodeDto,
  ): Promise<OAuthIdentity> {
    switch (provider) {
      case OAuthProvider.GOOGLE:
        return this.google.exchangeCode(dto as OAuthCodeDto);
      case OAuthProvider.APPLE:
        return this.apple.exchangeCode(dto);
      default:
        throw new OAuthProviderException();
    }
  }
}
