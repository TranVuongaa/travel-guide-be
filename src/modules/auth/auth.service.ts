import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider, Prisma, Role } from '@prisma/client';

import {
  AccountInactiveException,
  AccountLinkRequiredException,
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
  LastLoginMethodRequiredException,
  OAuthAccountConflictException,
  UserNotFoundException,
} from '../../common/exceptions/identity.exceptions';
import { RefreshAuthUser } from '../../common/interfaces/auth-user.interface';
import { PrismaService } from '../../database/prisma.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  userWithProvidersSelect,
  UserWithProviders,
} from '../users/interfaces/user-with-providers.interface';
import { PasswordHasherService } from '../users/password-hasher.service';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { AppleOAuthCodeDto, OAuthCodeDto } from './dto/oauth-code.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';
import { OAuthIdentity } from './interfaces/oauth-identity.interface';
import { OAuthProvidersService } from './providers/oauth-providers.service';

interface TokenUser {
  id: string;
  role: Role;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly usersService: UsersService,
    private readonly oauthProviders: OAuthProvidersService,
  ) {
    this.accessSecret = config.getOrThrow<string>('auth.jwtAccessSecret');
    this.refreshSecret = config.getOrThrow<string>('auth.jwtRefreshSecret');
    this.issuer = config.getOrThrow<string>('auth.jwtIssuer');
    this.audience = config.getOrThrow<string>('auth.jwtAudience');
    this.accessTtlSeconds = config.getOrThrow<number>('auth.accessTtlSeconds');
    this.refreshTtlSeconds = config.getOrThrow<number>(
      'auth.refreshTtlSeconds',
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const passwordHash = await this.passwordHasher.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing) {
          throw new EmailAlreadyRegisteredException();
        }

        const user = await transaction.user.create({
          data: {
            email,
            passwordHash,
            displayName: dto.displayName,
          },
          select: userWithProvidersSelect,
        });

        return this.createAuthResponse(transaction, user);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(dto.email) },
      select: userWithProvidersSelect,
    });
    if (
      !user?.passwordHash ||
      !(await this.passwordHasher.verify(user.passwordHash, dto.password))
    ) {
      throw new InvalidCredentialsException();
    }
    if (!user.isActive) {
      throw new AccountInactiveException();
    }

    return this.prisma.$transaction((transaction) =>
      this.createAuthResponse(transaction, user),
    );
  }

  async socialLogin(
    provider: OAuthProvider,
    dto: OAuthCodeDto | AppleOAuthCodeDto,
  ): Promise<AuthResponseDto> {
    const identity = await this.oauthProviders.exchangeCode(provider, dto);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const linked = await transaction.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider,
              providerAccountId: identity.providerAccountId,
            },
          },
          select: {
            user: {
              select: userWithProvidersSelect,
            },
          },
        });

        if (linked) {
          if (!linked.user.isActive) {
            throw new AccountInactiveException();
          }
          return this.createAuthResponse(transaction, linked.user);
        }

        const existingEmail = await transaction.user.findUnique({
          where: { email: this.normalizeEmail(identity.email) },
          select: { id: true },
        });
        if (existingEmail) {
          throw new AccountLinkRequiredException();
        }

        const user = await transaction.user.create({
          data: {
            email: this.normalizeEmail(identity.email),
            passwordHash: null,
            displayName: this.socialDisplayName(identity),
            avatarUrl: identity.avatarUrl,
            oauthAccounts: {
              create: {
                provider,
                providerAccountId: identity.providerAccountId,
                providerEmail: this.normalizeEmail(identity.email),
              },
            },
          },
          select: userWithProvidersSelect,
        });

        return this.createAuthResponse(transaction, user);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new OAuthAccountConflictException();
      }
      throw error;
    }
  }

  async linkOAuth(
    userId: string,
    provider: OAuthProvider,
    dto: OAuthCodeDto | AppleOAuthCodeDto,
  ): Promise<UserResponseDto> {
    const identity = await this.oauthProviders.exchangeCode(provider, dto);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await this.findUserWithProvidersOrFail(
          transaction,
          userId,
        );
        if (!user.isActive) {
          throw new AccountInactiveException();
        }

        const identityLink = await transaction.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider,
              providerAccountId: identity.providerAccountId,
            },
          },
          select: { userId: true },
        });
        if (identityLink && identityLink.userId !== userId) {
          throw new OAuthAccountConflictException();
        }

        const providerLink = await transaction.oAuthAccount.findUnique({
          where: {
            userId_provider: { userId, provider },
          },
          select: { id: true, providerAccountId: true },
        });
        if (
          providerLink &&
          providerLink.providerAccountId !== identity.providerAccountId
        ) {
          throw new OAuthAccountConflictException();
        }

        if (!providerLink) {
          await transaction.oAuthAccount.create({
            data: {
              userId,
              provider,
              providerAccountId: identity.providerAccountId,
              providerEmail: this.normalizeEmail(identity.email),
            },
          });
        }

        const updated = await this.findUserWithProvidersOrFail(
          transaction,
          userId,
        );
        return this.usersService.toResponse(updated);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new OAuthAccountConflictException();
      }
      throw error;
    }
  }

  async unlinkOAuth(
    userId: string,
    provider: OAuthProvider,
  ): Promise<UserResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await this.findUserWithProvidersOrFail(transaction, userId);
      const providerLinked = user.oauthAccounts.some(
        (account) => account.provider === provider,
      );

      if (!providerLinked) {
        return this.usersService.toResponse(user);
      }
      if (!user.passwordHash && user.oauthAccounts.length <= 1) {
        throw new LastLoginMethodRequiredException();
      }

      await transaction.oAuthAccount.delete({
        where: {
          userId_provider: { userId, provider },
        },
      });
      const updated = await this.findUserWithProvidersOrFail(
        transaction,
        userId,
      );
      return this.usersService.toResponse(updated);
    });
  }

  async refresh(
    user: RefreshAuthUser,
    rawRefreshToken: string,
  ): Promise<AuthResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.assertRefreshTokenValid(transaction, user, rawRefreshToken);
      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id: user.refreshTokenId,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new InvalidRefreshTokenException();
      }

      const currentUser = await this.findUserWithProvidersOrFail(
        transaction,
        user.id,
      );
      return this.createAuthResponse(transaction, currentUser);
    });
  }

  async logout(
    user: RefreshAuthUser,
    rawRefreshToken: string,
  ): Promise<{ loggedOut: true }> {
    await this.prisma.$transaction(async (transaction) => {
      await this.assertRefreshTokenValid(transaction, user, rawRefreshToken);
      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id: user.refreshTokenId,
          userId: user.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new InvalidRefreshTokenException();
      }
    });

    return { loggedOut: true };
  }

  async logoutAll(userId: string): Promise<{ sessionsRevoked: number }> {
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { sessionsRevoked: revoked.count };
  }

  private async createAuthResponse(
    transaction: Prisma.TransactionClient,
    user: UserWithProviders,
  ): Promise<AuthResponseDto> {
    const tokens = await this.issueTokenPair(transaction, user);
    return {
      user: this.usersService.toResponse(user),
      ...tokens,
    };
  }

  private async issueTokenPair(
    transaction: Prisma.TransactionClient,
    user: TokenUser,
  ): Promise<
    Pick<
      AuthResponseDto,
      'accessToken' | 'refreshToken' | 'accessTokenExpiresIn'
    >
  > {
    const refreshTokenId = randomUUID();
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      role: user.role,
      type: 'refresh',
      jti: refreshTokenId,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessSecret,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: this.accessTtlSeconds,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: this.refreshTtlSeconds,
      }),
    ]);
    const tokenHash = await this.passwordHasher.hash(refreshToken);

    await transaction.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
    };
  }

  private async assertRefreshTokenValid(
    transaction: Prisma.TransactionClient,
    user: RefreshAuthUser,
    rawRefreshToken: string,
  ): Promise<void> {
    const stored = await transaction.refreshToken.findUnique({
      where: { id: user.refreshTokenId },
      select: {
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (
      !stored ||
      stored.userId !== user.id ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      !(await this.passwordHasher.verify(stored.tokenHash, rawRefreshToken))
    ) {
      throw new InvalidRefreshTokenException();
    }
  }

  private async findUserWithProvidersOrFail(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<UserWithProviders> {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: userWithProvidersSelect,
    });
    if (!user) {
      throw new UserNotFoundException(userId);
    }
    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private socialDisplayName(identity: OAuthIdentity): string {
    const displayName = identity.displayName?.trim();
    if (displayName) {
      return displayName.slice(0, 100);
    }

    return identity.email.split('@')[0].slice(0, 100) || 'Traveler';
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
