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

type PostWithInternalSearch = Prisma.PostGetPayload<{
  include: typeof postWithRelationsInclude;
}>;

export type PostWithRelations = Omit<PostWithInternalSearch, 'searchText'>;
