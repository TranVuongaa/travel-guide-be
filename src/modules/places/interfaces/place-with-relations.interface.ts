import { Prisma } from '@prisma/client';

import { orderedEntityImages } from '../../../common/utils/entity-image-query.util';

export const placeWithRelationsInclude = {
  province: true,
  categories: {
    include: {
      category: true,
    },
  },
  images: orderedEntityImages,
} satisfies Prisma.PlaceInclude;

export type PlaceWithRelations = Prisma.PlaceGetPayload<{
  include: typeof placeWithRelationsInclude;
}>;
