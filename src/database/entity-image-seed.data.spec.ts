import { CATEGORY_SEEDS, PROVINCE_SEEDS } from './reference-seed.data';
import {
  ENTITY_IMAGE_SEEDS,
  EntityImageOwnerType,
} from './entity-image-seed.data';

describe('ENTITY_IMAGE_SEEDS', () => {
  it('should cover every current Province and Category plus all demo Places', () => {
    const provinceSlugs = ENTITY_IMAGE_SEEDS.filter(
      ({ ownerType }) => ownerType === EntityImageOwnerType.PROVINCE,
    ).map(({ ownerSlug }) => ownerSlug);
    const categorySlugs = ENTITY_IMAGE_SEEDS.filter(
      ({ ownerType }) => ownerType === EntityImageOwnerType.CATEGORY,
    ).map(({ ownerSlug }) => ownerSlug);
    const placeSlugs = ENTITY_IMAGE_SEEDS.filter(
      ({ ownerType }) => ownerType === EntityImageOwnerType.PLACE,
    ).map(({ ownerSlug }) => ownerSlug);

    expect(provinceSlugs).toEqual(PROVINCE_SEEDS.map(({ slug }) => slug));
    expect(categorySlugs).toEqual(CATEGORY_SEEDS.map(({ slug }) => slug));
    expect(placeSlugs).toEqual([
      'vinh-ha-long',
      'pho-co-hoi-an',
      'phong-nha-ke-bang',
      'da-lat',
      'phu-quoc',
      'dai-noi-hue',
    ]);
    expect(ENTITY_IMAGE_SEEDS).toHaveLength(52);
  });

  it('should have unique owner ordering and valid curated fields', () => {
    const identities = ENTITY_IMAGE_SEEDS.map(
      ({ ownerType, ownerSlug, sortOrder }) =>
        `${ownerType}:${ownerSlug}:${sortOrder}`,
    );

    expect(new Set(identities).size).toBe(ENTITY_IMAGE_SEEDS.length);
    for (const seed of ENTITY_IMAGE_SEEDS) {
      expect(seed.fileTitle).toMatch(/^File:.+\.(?:jpe?g|png)$/i);
      expect(seed.altText.trim().length).toBeGreaterThan(0);
      expect(seed.sortOrder).toBe(0);
    }
  });
});
