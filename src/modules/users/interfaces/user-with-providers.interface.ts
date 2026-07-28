import { Prisma } from '@prisma/client';

export const userWithProvidersSelect = {
  id: true,
  email: true,
  passwordHash: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  oauthAccounts: {
    select: {
      provider: true,
    },
    orderBy: {
      provider: 'asc',
    },
  },
} satisfies Prisma.UserSelect;

export type UserWithProviders = Prisma.UserGetPayload<{
  select: typeof userWithProvidersSelect;
}>;
