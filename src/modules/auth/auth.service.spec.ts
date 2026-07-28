import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider, Role } from '@prisma/client';

import {
  AccountLinkRequiredException,
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
  LastLoginMethodRequiredException,
} from '../../common/exceptions/identity.exceptions';
import { RefreshAuthUser } from '../../common/interfaces/auth-user.interface';
import { PrismaService } from '../../database/prisma.service';
import { UserWithProviders } from '../users/interfaces/user-with-providers.interface';
import { PasswordHasherService } from '../users/password-hasher.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { OAuthProvidersService } from './providers/oauth-providers.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';

const user: UserWithProviders = {
  id: USER_ID,
  email: 'traveler@example.com',
  passwordHash: 'password-hash',
  displayName: 'Traveler',
  avatarUrl: null,
  role: Role.USER,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  oauthAccounts: [],
};

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  oAuthAccount: {
    findUnique: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let passwordHasher: {
    hash: jest.Mock;
    verify: jest.Mock;
  };
  let oauthProviders: {
    exchangeCode: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: PrismaMock) => Promise<unknown>) =>
        callback(prisma),
    );
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('stored-hash'),
      verify: jest.fn(),
    };
    oauthProviders = {
      exchangeCode: jest.fn(),
    };
    const jwtService = {
      signAsync: jest
        .fn()
        .mockImplementation((payload: { type: string }) =>
          Promise.resolve(
            payload.type === 'access' ? 'access-token' : 'refresh-token',
          ),
        ),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          'auth.jwtAccessSecret': 'access-secret',
          'auth.jwtRefreshSecret': 'refresh-secret',
          'auth.jwtIssuer': 'issuer',
          'auth.jwtAudience': 'audience',
          'auth.accessTtlSeconds': 900,
          'auth.refreshTtlSeconds': 2592000,
        };
        return values[key];
      }),
    };
    const usersService = {
      toResponse: jest.fn((record: UserWithProviders) => ({
        id: record.id,
        email: record.email,
        displayName: record.displayName,
        avatarUrl: record.avatarUrl,
        role: record.role,
        isActive: record.isActive,
        hasPassword: record.passwordHash !== null,
        oauthProviders: record.oauthAccounts.map((account) => account.provider),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      passwordHasher as unknown as PasswordHasherService,
      usersService as unknown as UsersService,
      oauthProviders as unknown as OAuthProvidersService,
    );
  });

  it('should register a normalized local account and issue a token pair', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({ id: TOKEN_ID });

    const result = await service.register({
      email: ' Traveler@Example.com ',
      password: 'strong-password',
      displayName: 'Traveler',
    });

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresIn: 900,
      }),
    );
    const createCalls = prisma.user.create.mock.calls as unknown as Array<
      [{ data: { email: string } }]
    >;
    const createArgs = createCalls[0][0];
    expect(createArgs.data.email).toBe('traveler@example.com');
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('should reject a duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

    await expect(
      service.register({
        email: user.email,
        password: 'strong-password',
        displayName: user.displayName,
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredException);
  });

  it('should reject invalid credentials without exposing account existence', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwordHasher.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('should log in an active local account and create a refresh session', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwordHasher.verify.mockResolvedValue(true);
    prisma.refreshToken.create.mockResolvedValue({ id: TOKEN_ID });

    await expect(
      service.login({ email: user.email, password: 'strong-password' }),
    ).resolves.toEqual(
      expect.objectContaining({ accessToken: 'access-token' }),
    );
  });

  it('should rotate a valid refresh token exactly once', async () => {
    const refreshUser: RefreshAuthUser = {
      id: USER_ID,
      email: user.email,
      displayName: user.displayName,
      role: Role.USER,
      refreshTokenId: TOKEN_ID,
    };
    prisma.refreshToken.findUnique.mockResolvedValue({
      userId: USER_ID,
      tokenHash: 'stored-hash',
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
    });
    passwordHasher.verify.mockResolvedValue(true);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({ id: 'new-token-id' });

    await expect(
      service.refresh(refreshUser, 'refresh-token'),
    ).resolves.toEqual(
      expect.objectContaining({ refreshToken: 'refresh-token' }),
    );

    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.refresh(refreshUser, 'refresh-token'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('should create a new social user for a new verified provider identity', async () => {
    oauthProviders.exchangeCode.mockResolvedValue({
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'google-subject',
      email: 'google@example.com',
      displayName: 'Google Traveler',
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      ...user,
      email: 'google@example.com',
      passwordHash: null,
      oauthAccounts: [{ provider: OAuthProvider.GOOGLE }],
    });
    prisma.refreshToken.create.mockResolvedValue({ id: TOKEN_ID });

    const result = await service.socialLogin(OAuthProvider.GOOGLE, {
      authorizationCode: 'code',
      redirectUri: 'https://client.test/oauth/callback',
      codeVerifier: 'a'.repeat(43),
    });

    expect(result.user.oauthProviders).toEqual([OAuthProvider.GOOGLE]);
  });

  it('should require explicit linking when a provider email already exists', async () => {
    oauthProviders.exchangeCode.mockResolvedValue({
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'google-subject',
      email: user.email,
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

    await expect(
      service.socialLogin(OAuthProvider.GOOGLE, {
        authorizationCode: 'code',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'a'.repeat(43),
      }),
    ).rejects.toBeInstanceOf(AccountLinkRequiredException);
  });

  it('should link an identity only after authentication', async () => {
    oauthProviders.exchangeCode.mockResolvedValue({
      provider: OAuthProvider.APPLE,
      providerAccountId: 'apple-subject',
      email: 'relay@privaterelay.appleid.com',
    });
    prisma.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce({
      ...user,
      oauthAccounts: [{ provider: OAuthProvider.APPLE }],
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.oAuthAccount.create.mockResolvedValue({ id: 'oauth-id' });

    await expect(
      service.linkOAuth(USER_ID, OAuthProvider.APPLE, {
        authorizationCode: 'code',
        redirectUri: 'https://client.test/oauth/callback',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ oauthProviders: [OAuthProvider.APPLE] }),
    );
  });

  it('should prevent unlinking the final login method', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash: null,
      oauthAccounts: [{ provider: OAuthProvider.APPLE }],
    });

    await expect(
      service.unlinkOAuth(USER_ID, OAuthProvider.APPLE),
    ).rejects.toBeInstanceOf(LastLoginMethodRequiredException);
  });
});
