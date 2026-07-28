import { Prisma } from '@prisma/client';

export const postWithRelationsInclude = {
  author: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  place: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} satisfies Prisma.PostInclude;

export type PostWithRelations = Prisma.PostGetPayload<{
  include: typeof postWithRelationsInclude;
}>;
