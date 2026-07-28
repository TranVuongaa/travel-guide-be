import { Prisma } from '@prisma/client';

export const orderedEntityImages = {
  select: {
    id: true,
    url: true,
    sourcePageUrl: true,
    altText: true,
    author: true,
    licenseName: true,
    licenseUrl: true,
    width: true,
    height: true,
    sortOrder: true,
  },
  orderBy: [{ sortOrder: Prisma.SortOrder.asc }, { id: Prisma.SortOrder.asc }],
} satisfies Prisma.EntityImageFindManyArgs;
