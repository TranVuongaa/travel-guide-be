import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import {
  CurrentPasswordIncorrectException,
  PasswordUnchangedException,
  SelfDeactivationForbiddenException,
  SelfRoleChangeForbiddenException,
  UserNotFoundException,
} from '../../common/exceptions/identity.exceptions';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  userWithProvidersSelect,
  UserWithProviders,
} from './interfaces/user-with-providers.interface';
import { PasswordHasherService } from './password-hasher.service';

const authUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async findAuthUserById(
    id: string,
  ): Promise<(AuthUser & { isActive: boolean }) | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
    });

    return user ? this.toAuthUser(user) : null;
  }

  async findAll(
    query: QueryUserDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                displayName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortOrder },
      { id: SortOrder.ASC },
    ];
    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        select: userWithProvidersSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toResponse(user)),
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async findOneOrFail(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userWithProvidersSelect,
    });

    if (!user) {
      throw new UserNotFoundException(id);
    }

    return this.toResponse(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    await this.ensureUserExists(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: userWithProvidersSelect,
    });

    return this.toResponse(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ sessionsRevoked: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (
      !user.passwordHash ||
      !(await this.passwordHasher.verify(
        user.passwordHash,
        dto.currentPassword,
      ))
    ) {
      throw new CurrentPasswordIncorrectException();
    }

    if (await this.passwordHasher.verify(user.passwordHash, dto.newPassword)) {
      throw new PasswordUnchangedException();
    }

    const passwordHash = await this.passwordHasher.hash(dto.newPassword);
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { sessionsRevoked: revoked.count };
  }

  async updateRole(
    adminId: string,
    userId: string,
    dto: UpdateUserRoleDto,
  ): Promise<UserResponseDto> {
    if (adminId === userId) {
      throw new SelfRoleChangeForbiddenException();
    }

    await this.ensureUserExists(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: userWithProvidersSelect,
    });

    return this.toResponse(user);
  }

  async updateStatus(
    adminId: string,
    userId: string,
    dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    if (adminId === userId && !dto.isActive) {
      throw new SelfDeactivationForbiddenException();
    }

    await this.ensureUserExists(userId);
    const user = await this.prisma.$transaction(async (transaction) => {
      const updatedUser = await transaction.user.update({
        where: { id: userId },
        data: { isActive: dto.isActive },
        select: userWithProvidersSelect,
      });

      if (!dto.isActive) {
        await transaction.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return updatedUser;
    });

    return this.toResponse(user);
  }

  toResponse(user: UserWithProviders): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isActive: user.isActive,
      hasPassword: user.passwordHash !== null,
      oauthProviders: user.oauthAccounts.map(({ provider }) => provider),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async ensureUserExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new UserNotFoundException(id);
    }
  }

  private toAuthUser(user: AuthUserRecord): AuthUser & { isActive: boolean } {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
