import { CATEGORY_SEEDS, PROVINCE_SEEDS } from './reference-seed.data';

describe('reference seed data', () => {
  it('should contain the approved 34 unique provinces', () => {
    expect(PROVINCE_SEEDS).toHaveLength(34);
    expect(new Set(PROVINCE_SEEDS.map(({ name }) => name)).size).toBe(34);
    expect(new Set(PROVINCE_SEEDS.map(({ slug }) => slug)).size).toBe(34);
    expect(PROVINCE_SEEDS).toContainEqual({
      name: 'Hồ Chí Minh',
      slug: 'ho-chi-minh',
    });
  });

  it('should contain the approved 12 unique categories', () => {
    expect(CATEGORY_SEEDS).toHaveLength(12);
    expect(new Set(CATEGORY_SEEDS.map(({ name }) => name)).size).toBe(12);
    expect(new Set(CATEGORY_SEEDS.map(({ slug }) => slug)).size).toBe(12);
    expect(CATEGORY_SEEDS).toContainEqual({
      name: 'Biển & đảo',
      slug: 'bien-dao',
    });
  });

  it('should not contain blank names or slugs', () => {
    for (const item of [...PROVINCE_SEEDS, ...CATEGORY_SEEDS]) {
      expect(item.name.trim()).not.toBe('');
      expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
