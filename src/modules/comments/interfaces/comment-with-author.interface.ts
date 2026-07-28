import { Prisma } from '@prisma/client';

export const commentWithAuthorInclude = {
  author: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.CommentInclude;

export type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: typeof commentWithAuthorInclude;
}>;
