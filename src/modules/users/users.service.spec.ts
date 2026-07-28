import { OAuthProvider, Role } from '@prisma/client';

import {
  CurrentPasswordIncorrectException,
  SelfDeactivationForbiddenException,
  SelfRoleChangeForbiddenException,
} from '../../common/exceptions/identity.exceptions';
import { PrismaService } from '../../database/prisma.service';
import { QueryUserDto, UserSortBy } from './dto/query-user.dto';
import { UserWithProviders } from './interfaces/user-with-providers.interface';
import { PasswordHasherService } from './password-hasher.service';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

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
  oauthAccounts: [{ provider: OAuthProvider.GOOGLE }],
};

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;
  let passwordHasher: {
    hash: jest.Mock;
    verify: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (
        input:
          Promise<unknown>[] | ((transaction: PrismaMock) => Promise<unknown>),
      ) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input(prisma);
      },
    );
    passwordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordHasher as unknown as PasswordHasherService,
    );
  });

  it('should return a current auth user with current role and status', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.findAuthUserById(USER_ID)).resolves.toEqual({
      id: USER_ID,
      email: user.email,
      displayName: user.displayName,
      role: Role.USER,
      isActive: true,
    });
  });

  it('should list users with search, role, status, and pagination', async () => {
    prisma.user.findMany.mockResolvedValue([user]);
    prisma.user.count.mockResolvedValue(1);
    const query = Object.assign(new QueryUserDto(), {
      page: 1,
      limit: 10,
      search: 'traveler',
      role: Role.USER,
      isActive: true,
      sortBy: UserSortBy.EMAIL,
      sortOrder: 'asc',
    });

    const result = await service.findAll(query);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: USER_ID,
        hasPassword: true,
        oauthProviders: [OAuthProvider.GOOGLE],
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: [{ email: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('should update only approved profile fields', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.user.update.mockResolvedValue({
      ...user,
      displayName: 'Updated traveler',
    });

    const result = await service.updateProfile(USER_ID, {
      displayName: 'Updated traveler',
      avatarUrl: null,
    });

    expect(result.displayName).toBe('Updated traveler');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: 'Updated traveler', avatarUrl: null },
      }),
    );
  });

  it('should change password and revoke every active refresh session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      passwordHash: 'old-hash',
    });
    passwordHasher.verify
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    passwordHasher.hash.mockResolvedValue('new-hash');
    prisma.user.update.mockResolvedValue(user);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.changePassword(USER_ID, {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual({ sessionsRevoked: 3 });
  });

  it('should reject a wrong current password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      passwordHash: 'old-hash',
    });
    passwordHasher.verify.mockResolvedValue(false);

    await expect(
      service.changePassword(USER_ID, {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordIncorrectException);
  });

  it('should prevent an administrator from changing their own role', async () => {
    await expect(
      service.updateRole(ADMIN_ID, ADMIN_ID, { role: Role.USER }),
    ).rejects.toBeInstanceOf(SelfRoleChangeForbiddenException);
  });

  it('should update another user role', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.user.update.mockResolvedValue({ ...user, role: Role.EDITOR });

    await expect(
      service.updateRole(ADMIN_ID, USER_ID, { role: Role.EDITOR }),
    ).resolves.toEqual(expect.objectContaining({ role: Role.EDITOR }));
  });

  it('should prevent self-deactivation and revoke sessions for another user', async () => {
    await expect(
      service.updateStatus(ADMIN_ID, ADMIN_ID, { isActive: false }),
    ).rejects.toBeInstanceOf(SelfDeactivationForbiddenException);

    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.user.update.mockResolvedValue({ ...user, isActive: false });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.updateStatus(ADMIN_ID, USER_ID, { isActive: false }),
    ).resolves.toEqual(expect.objectContaining({ isActive: false }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });
});
