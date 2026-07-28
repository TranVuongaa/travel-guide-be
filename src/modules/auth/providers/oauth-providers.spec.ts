import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import { OAuthProviderException } from '../../../common/exceptions/identity.exceptions';
import { AppleOAuthProvider } from './apple-oauth.provider';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { OAuthProvidersService } from './oauth-providers.service';
import { OAuthRedirectValidatorService } from './oauth-redirect-validator.service';

describe('OAuth providers', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let redirectValidator: {
    assertAllowed: jest.Mock;
  };
  let config: {
    getOrThrow: jest.Mock;
  };
  let oidcCrypto: {
    verifyGoogle: jest.Mock;
    verifyApple: jest.Mock;
    createAppleClientSecret: jest.Mock;
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    redirectValidator = { assertAllowed: jest.fn() };
    oidcCrypto = {
      verifyGoogle: jest.fn(),
      verifyApple: jest.fn(),
      createAppleClientSecret: jest
        .fn()
        .mockResolvedValue('apple-client-secret'),
    };
    config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'auth.googleClientId': 'google-client',
          'auth.googleClientSecret': 'google-secret',
          'auth.appleClientId': 'apple-client',
          'auth.appleTeamId': 'apple-team',
          'auth.appleKeyId': 'apple-key',
          'auth.applePrivateKey': 'apple-private-key',
        };
        return values[key];
      }),
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should exchange and verify a Google code with PKCE', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: 'google-id-token' }),
    });
    oidcCrypto.verifyGoogle.mockResolvedValue({
      sub: 'google-subject',
      email: 'Traveler@Example.com',
      email_verified: true,
      name: 'Traveler',
      picture: 'https://example.com/avatar.jpg',
    });
    const provider = new GoogleOAuthProvider(
      config as unknown as ConfigService,
      redirectValidator as unknown as OAuthRedirectValidatorService,
      oidcCrypto,
    );

    const identity = await provider.exchangeCode({
      authorizationCode: 'google-code',
      redirectUri: 'https://client.test/oauth/callback',
      codeVerifier: 'a'.repeat(43),
    });

    expect(identity).toEqual({
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'google-subject',
      email: 'traveler@example.com',
      displayName: 'Traveler',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, { body: URLSearchParams }]
    >;
    expect(fetchCalls[0][1].body.get('code_verifier')).toBe('a'.repeat(43));
  });

  it('should exchange an Apple code without sending an unsupported PKCE field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: 'apple-id-token' }),
    });
    oidcCrypto.verifyApple.mockResolvedValue({
      sub: 'apple-subject',
      email: 'relay@privaterelay.appleid.com',
      email_verified: 'true',
    });
    const provider = new AppleOAuthProvider(
      config as unknown as ConfigService,
      redirectValidator as unknown as OAuthRedirectValidatorService,
      oidcCrypto,
    );

    const identity = await provider.exchangeCode({
      authorizationCode: 'apple-code',
      redirectUri: 'https://client.test/oauth/callback',
      givenName: 'Apple',
      familyName: 'Traveler',
    });

    expect(identity).toEqual({
      provider: OAuthProvider.APPLE,
      providerAccountId: 'apple-subject',
      email: 'relay@privaterelay.appleid.com',
      displayName: 'Apple Traveler',
    });
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, { body: URLSearchParams }]
    >;
    expect(fetchCalls[0][1].body.get('code_verifier')).toBeNull();
    expect(fetchCalls[0][1].body.get('client_secret')).toBe(
      'apple-client-secret',
    );
  });

  it('should map provider failures to a non-sensitive domain error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'provider-internal-detail' }),
    });
    const provider = new GoogleOAuthProvider(
      config as unknown as ConfigService,
      redirectValidator as unknown as OAuthRedirectValidatorService,
      oidcCrypto,
    );

    await expect(
      provider.exchangeCode({
        authorizationCode: 'rejected-code',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'a'.repeat(43),
      }),
    ).rejects.toBeInstanceOf(OAuthProviderException);
  });

  it('should route only supported providers to their adapters', async () => {
    const google = {
      exchangeCode: jest.fn().mockResolvedValue({
        provider: OAuthProvider.GOOGLE,
        providerAccountId: 'google-subject',
        email: 'google@example.com',
      }),
    };
    const apple = {
      exchangeCode: jest.fn(),
    };
    const providers = new OAuthProvidersService(
      google as unknown as GoogleOAuthProvider,
      apple as unknown as AppleOAuthProvider,
    );
    const dto = {
      authorizationCode: 'code',
      redirectUri: 'https://client.test/oauth/callback',
      codeVerifier: 'a'.repeat(43),
    };

    await expect(
      providers.exchangeCode(OAuthProvider.GOOGLE, dto),
    ).resolves.toEqual(expect.objectContaining({ provider: 'GOOGLE' }));
    expect(google.exchangeCode).toHaveBeenCalledWith(dto);
    expect(apple.exchangeCode).not.toHaveBeenCalled();
  });
});
