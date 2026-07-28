import { Prisma } from '@prisma/client';

export const reviewWithRelationsInclude = {
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
} satisfies Prisma.ReviewInclude;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewWithRelationsInclude;
}>;
