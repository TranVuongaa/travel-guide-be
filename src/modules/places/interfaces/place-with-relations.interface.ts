import { Prisma } from '@prisma/client';

import { orderedEntityImages } from '../../../common/utils/entity-image-query.util';

export const placeWithRelationsInclude = {
  province: {
    omit: {
      searchText: true,
    },
  },
  categories: {
    include: {
      category: {
        omit: {
          searchText: true,
        },
      },
    },
  },
  images: orderedEntityImages,
} satisfies Prisma.PlaceInclude;

type PlaceWithInternalSearch = Prisma.PlaceGetPayload<{
  include: typeof placeWithRelationsInclude;
}>;

export type PlaceWithRelations = Omit<PlaceWithInternalSearch, 'searchText'>;
