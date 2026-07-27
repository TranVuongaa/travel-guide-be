import { Prisma } from '@prisma/client';

export const placeWithRelationsInclude = {
  province: true,
  categories: {
    include: {
      category: true,
    },
  },
} satisfies Prisma.PlaceInclude;

export type PlaceWithRelations = Prisma.PlaceGetPayload<{
  include: typeof placeWithRelationsInclude;
}>;
