import { OAuthProvider } from '@prisma/client';

import { AppleOAuthCodeDto, OAuthCodeDto } from '../dto/oauth-code.dto';

export interface OAuthIdentity {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export type ProviderOAuthCodeDto = OAuthCodeDto | AppleOAuthCodeDto;

export interface OAuthProviderAdapter {
  exchangeCode(dto: ProviderOAuthCodeDto): Promise<OAuthIdentity>;
}
