import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { OAuthProvider, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { OAuthProvidersService } from '../src/modules/auth/providers/oauth-providers.service';
import { PlacesService } from '../src/modules/places/places.service';

type SupertestApp = Parameters<typeof request>[0];

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredOAuthAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerAccountId: string;
  providerEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

interface AuthBody {
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      role: Role;
      oauthProviders: OAuthProvider[];
    };
    accessToken: string;
    refreshToken: string;
  };
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
  };
}

interface UserBody {
  data: {
    id: string;
    hasPassword: boolean;
    oauthProviders: OAuthProvider[];
  };
}

interface InMemoryPrisma {
  users: StoredUser[];
  oauthAccounts: StoredOAuthAccount[];
  refreshTokens: StoredRefreshToken[];
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $transaction: jest.Mock;
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
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
}

function createPrismaMock(): InMemoryPrisma {
  const users: StoredUser[] = [];
  const oauthAccounts: StoredOAuthAccount[] = [];
  const refreshTokens: StoredRefreshToken[] = [];

  const withProviders = (user: StoredUser) => ({
    ...user,
    oauthAccounts: oauthAccounts
      .filter((account) => account.userId === user.id)
      .map((account) => ({ provider: account.provider })),
  });
  const findUser = (where: { id?: string; email?: string }) =>
    users.find(
      (user) =>
        (where.id !== undefined && user.id === where.id) ||
        (where.email !== undefined && user.email === where.email),
    );
  const matchesRefreshWhere = (
    token: StoredRefreshToken,
    where: Record<string, unknown>,
  ) => {
    if (where.id !== undefined && token.id !== where.id) return false;
    if (where.userId !== undefined && token.userId !== where.userId) {
      return false;
    }
    if (where.revokedAt === null && token.revokedAt !== null) return false;
    const expiresAt = where.expiresAt as { gt?: Date } | undefined;
    if (expiresAt?.gt && token.expiresAt <= expiresAt.gt) return false;
    return true;
  };

  const prisma: InMemoryPrisma = {
    users,
    oauthAccounts,
    refreshTokens,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn(
      async (
        input:
          | Promise<unknown>[]
          | ((transaction: typeof prisma) => Promise<unknown>),
      ) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input(prisma);
      },
    ),
    user: {
      findUnique: jest.fn(
        (args: { where: { id?: string; email?: string } }) => {
          const found = findUser(args.where);
          return found ? withProviders(found) : null;
        },
      ),
      create: jest.fn(
        (args: {
          data: {
            email: string;
            passwordHash?: string | null;
            displayName: string;
            avatarUrl?: string;
            role?: Role;
            isActive?: boolean;
            oauthAccounts?: {
              create: {
                provider: OAuthProvider;
                providerAccountId: string;
                providerEmail: string;
              };
            };
          };
        }) => {
          const now = new Date();
          const created: StoredUser = {
            id: randomUUID(),
            email: args.data.email,
            passwordHash: args.data.passwordHash ?? null,
            displayName: args.data.displayName,
            avatarUrl: args.data.avatarUrl ?? null,
            role: args.data.role ?? Role.USER,
            isActive: args.data.isActive ?? true,
            createdAt: now,
            updatedAt: now,
          };
          users.push(created);
          if (args.data.oauthAccounts) {
            oauthAccounts.push({
              id: randomUUID(),
              userId: created.id,
              ...args.data.oauthAccounts.create,
              createdAt: now,
              updatedAt: now,
            });
          }
          return withProviders(created);
        },
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: Partial<
            Pick<
              StoredUser,
              'passwordHash' | 'displayName' | 'avatarUrl' | 'role' | 'isActive'
            >
          >;
        }) => {
          const found = findUser(args.where);
          if (!found) throw new Error('User not found');
          Object.assign(found, args.data, { updatedAt: new Date() });
          return withProviders(found);
        },
      ),
      findMany: jest.fn(() => users.map(withProviders)),
      count: jest.fn(() => users.length),
    },
    refreshToken: {
      create: jest.fn(
        (args: {
          data: Omit<StoredRefreshToken, 'createdAt' | 'revokedAt'>;
        }) => {
          const created: StoredRefreshToken = {
            ...args.data,
            revokedAt: null,
            createdAt: new Date(),
          };
          refreshTokens.push(created);
          return created;
        },
      ),
      findUnique: jest.fn((args: { where: { id: string } }) => {
        return (
          refreshTokens.find((token) => token.id === args.where.id) ?? null
        );
      }),
      updateMany: jest.fn(
        (args: {
          where: Record<string, unknown>;
          data: { revokedAt: Date };
        }) => {
          const matched = refreshTokens.filter((token) =>
            matchesRefreshWhere(token, args.where),
          );
          matched.forEach((token) => {
            token.revokedAt = args.data.revokedAt;
          });
          return { count: matched.length };
        },
      ),
    },
    oAuthAccount: {
      findUnique: jest.fn(
        (args: {
          where: {
            provider_providerAccountId?: {
              provider: OAuthProvider;
              providerAccountId: string;
            };
            userId_provider?: {
              userId: string;
              provider: OAuthProvider;
            };
          };
          select?: { user?: unknown };
        }) => {
          const compound = args.where.provider_providerAccountId;
          const userProvider = args.where.userId_provider;
          const found = oauthAccounts.find(
            (account) =>
              (compound !== undefined &&
                account.provider === compound.provider &&
                account.providerAccountId === compound.providerAccountId) ||
              (userProvider !== undefined &&
                account.userId === userProvider.userId &&
                account.provider === userProvider.provider),
          );
          if (!found) return null;
          if (args.select?.user) {
            const owner = findUser({ id: found.userId });
            return { user: owner ? withProviders(owner) : null };
          }
          return found;
        },
      ),
      create: jest.fn(
        (args: {
          data: Pick<
            StoredOAuthAccount,
            'userId' | 'provider' | 'providerAccountId' | 'providerEmail'
          >;
        }) => {
          const now = new Date();
          const created: StoredOAuthAccount = {
            id: randomUUID(),
            ...args.data,
            createdAt: now,
            updatedAt: now,
          };
          oauthAccounts.push(created);
          return created;
        },
      ),
      delete: jest.fn(
        (args: {
          where: {
            userId_provider: {
              userId: string;
              provider: OAuthProvider;
            };
          };
        }) => {
          const index = oauthAccounts.findIndex(
            (account) =>
              account.userId === args.where.userId_provider.userId &&
              account.provider === args.where.userId_provider.provider,
          );
          if (index < 0) throw new Error('OAuth account not found');
          return oauthAccounts.splice(index, 1)[0];
        },
      ),
    },
  };

  return prisma;
}

describe('Auth and Users API (e2e)', () => {
  let app: INestApplication;
  const prisma = createPrismaMock();
  const placesService = {
    findAll: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn().mockImplementation((userId: string) => ({
      id: '33333333-3333-4333-8333-333333333333',
      createdById: userId,
      name: 'Authenticated Place',
    })),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const oauthProviders = {
    exchangeCode: jest.fn(
      (provider: OAuthProvider, dto: { authorizationCode: string }) => {
        const identities: Record<
          string,
          {
            providerAccountId: string;
            email: string;
            displayName: string;
          }
        > = {
          'google-new': {
            providerAccountId: 'google-new-subject',
            email: 'google@example.com',
            displayName: 'Google Traveler',
          },
          'google-conflict': {
            providerAccountId: 'google-conflict-subject',
            email: 'local@example.com',
            displayName: 'Local Traveler',
          },
          'apple-new': {
            providerAccountId: 'apple-new-subject',
            email: 'relay@privaterelay.appleid.com',
            displayName: 'Apple Traveler',
          },
        };
        const identity = identities[dto.authorizationCode];
        if (!identity) throw new Error('Unknown test OAuth code');
        return Promise.resolve({ provider, ...identity });
      },
    ),
  };

  let localUserId: string;
  let localAccessToken: string;
  let currentRefreshToken: string;
  let googleUserId: string;
  let googleAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(OAuthProvidersService)
      .useValue(oauthProviders)
      .overrideProvider(PlacesService)
      .useValue(placesService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { enableSwagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should publish the approved Auth and Users routes in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').addBearerAuth().build(),
    );

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/oauth/google',
        '/api/v1/auth/oauth/apple',
        '/api/v1/users/me',
        '/api/v1/users/me/oauth/google',
        '/api/v1/users/{id}/role',
      ]),
    );
  });

  it('should keep the current-user profile private', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/users/me')
      .expect(401);
  });

  it('should register and read the authenticated profile', async () => {
    const registerResponse = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/register')
      .send({
        email: 'Local@Example.com',
        password: 'strong-password',
        displayName: 'Local Traveler',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthBody;
    localUserId = registerBody.data.user.id;
    localAccessToken = registerBody.data.accessToken;
    currentRefreshToken = registerBody.data.refreshToken;

    expect(registerBody.data.user.email).toBe('local@example.com');
    expect(registerBody.data.user.role).toBe(Role.USER);

    const profile = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get('/api/v1/users/me')
      .set('authorization', `Bearer ${localAccessToken}`)
      .expect(200);

    const profileBody = profile.body as unknown as UserBody;
    expect(profileBody.data.id).toBe(localUserId);
    expect(profileBody.data.hasPassword).toBe(true);
  });

  it('should reject a bad password with a generic domain error', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/login')
      .send({ email: 'local@example.com', password: 'wrong-password' })
      .expect(401);

    expect((response.body as ErrorBody).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should rotate refresh tokens and reject reuse', async () => {
    const oldRefreshToken = currentRefreshToken;
    const rotatedResponse = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);
    currentRefreshToken = (rotatedResponse.body as AuthBody).data.refreshToken;

    const reused = await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    expect((reused.body as ErrorBody).error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('should require explicit linking for a matching social email', async () => {
    const conflict = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/oauth/google')
      .send({
        authorizationCode: 'google-conflict',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'a'.repeat(43),
      })
      .expect(409);
    expect((conflict.body as ErrorBody).error.code).toBe(
      'ACCOUNT_LINK_REQUIRED',
    );

    const linked = await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/users/me/oauth/google')
      .set('authorization', `Bearer ${localAccessToken}`)
      .send({
        authorizationCode: 'google-conflict',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'a'.repeat(43),
      })
      .expect(200);
    const linkedBody = linked.body as unknown as UserBody;
    expect(linkedBody.data.oauthProviders).toEqual([OAuthProvider.GOOGLE]);

    const unlinked = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .delete('/api/v1/users/me/oauth/GOOGLE')
      .set('authorization', `Bearer ${localAccessToken}`)
      .expect(200);
    const unlinkedBody = unlinked.body as unknown as UserBody;
    expect(unlinkedBody.data.oauthProviders).toEqual([]);
  });

  it('should reuse immutable social links and protect the final login method', async () => {
    const google = await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/oauth/google')
      .send({
        authorizationCode: 'google-new',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'c'.repeat(43),
      })
      .expect(200);
    const googleBody = google.body as unknown as AuthBody;
    googleUserId = googleBody.data.user.id;
    googleAccessToken = googleBody.data.accessToken;

    const repeated = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/oauth/google')
      .send({
        authorizationCode: 'google-new',
        redirectUri: 'https://client.test/oauth/callback',
        codeVerifier: 'd'.repeat(43),
      })
      .expect(200);
    expect((repeated.body as AuthBody).data.user.id).toBe(googleUserId);

    const social = await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/oauth/apple')
      .send({
        authorizationCode: 'apple-new',
        redirectUri: 'https://client.test/oauth/callback',
      })
      .expect(200);
    const socialBody = social.body as unknown as AuthBody;

    expect(socialBody.data.user.oauthProviders).toEqual([OAuthProvider.APPLE]);

    const unlink = await request(app.getHttpServer() as unknown as SupertestApp)
      .delete('/api/v1/users/me/oauth/APPLE')
      .set('authorization', `Bearer ${socialBody.data.accessToken}`)
      .expect(409);
    expect((unlink.body as ErrorBody).error.code).toBe(
      'LAST_LOGIN_METHOD_REQUIRED',
    );
  });

  it('should enforce current database roles and protect admin self-management', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/users')
      .set('authorization', `Bearer ${localAccessToken}`)
      .expect(403);

    const local = prisma.users.find((user) => user.id === localUserId);
    if (!local) throw new Error('Local test user was not created');
    local.role = Role.ADMIN;

    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/users')
      .set('authorization', `Bearer ${localAccessToken}`)
      .expect(200);

    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/users/${googleUserId}/status`)
      .set('authorization', `Bearer ${localAccessToken}`)
      .send({ isActive: false })
      .expect(200);

    const deactivated = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get('/api/v1/users/me')
      .set('authorization', `Bearer ${googleAccessToken}`)
      .expect(403);
    expect((deactivated.body as ErrorBody).error.code).toBe('ACCOUNT_INACTIVE');

    const selfRole = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .patch(`/api/v1/users/${localUserId}/role`)
      .set('authorization', `Bearer ${localAccessToken}`)
      .send({ role: Role.USER })
      .expect(403);
    expect((selfRole.body as ErrorBody).error.code).toBe(
      'SELF_ROLE_CHANGE_FORBIDDEN',
    );

    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/places')
      .set('authorization', `Bearer ${localAccessToken}`)
      .send({
        name: 'Authenticated Place',
        description: 'Created through an authenticated boundary.',
        provinceId: '44444444-4444-4444-8444-444444444444',
        categoryIds: ['55555555-5555-4555-8555-555555555555'],
      })
      .expect(201);

    expect(placesService.create).toHaveBeenCalledWith(
      localUserId,
      expect.any(Object),
    );
  });

  it('should revoke a session on logout and reject it afterward', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: currentRefreshToken })
      .expect(200);

    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: currentRefreshToken })
      .expect(401);
    expect((response.body as ErrorBody).error.code).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });

  it('should revoke every session through logout-all', async () => {
    const login = await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/login')
      .send({ email: 'local@example.com', password: 'strong-password' })
      .expect(200);
    const loginBody = login.body as unknown as AuthBody;

    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${loginBody.data.accessToken}`)
      .expect(200);

    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginBody.data.refreshToken })
      .expect(401);
  });
});
