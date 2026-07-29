import {
  matchDestinationPlace,
  matchPlaceId,
  resolveCategoryIds,
} from './place-matcher';

describe('matchPlaceId', () => {
  const places = [
    { id: 'ha-long', name: 'Ha Long Bay' },
    { id: 'hoi-an', name: 'Hoi An' },
  ];

  it('should return one unambiguous normalized Place match', () => {
    expect(matchPlaceId('A travel guide to Hạ Long Bay', places)).toBe(
      'ha-long',
    );
  });

  it('should match a normalized destination only within its Province', () => {
    const match = matchDestinationPlace('Hạ Long Bay', 'quang-ninh', [
      {
        id: 'ha-long',
        name: 'Ha Long Bay',
        provinceId: 'quang-ninh',
        description: '',
        content: '',
        address: null,
        latitude: null,
        longitude: null,
      },
      {
        id: 'other',
        name: 'Ha Long Bay',
        provinceId: 'other-province',
        description: '',
        content: '',
        address: null,
        latitude: null,
        longitude: null,
      },
    ]);

    expect(match?.id).toBe('ha-long');
  });

  it('should resolve existing categories from Vietnamese travel hints', () => {
    expect(
      resolveCategoryIds('Bãi biển, đảo và khu nghỉ dưỡng', [
        { id: 'beach', name: 'Biển & đảo', slug: 'bien-dao' },
        { id: 'mountain', name: 'Núi & cao nguyên', slug: 'nui-cao-nguyen' },
        { id: 'resort', name: 'Nghỉ dưỡng', slug: 'nghi-duong' },
      ]),
    ).toEqual(['beach', 'resort']);
  });

  it('should return null for no match or multiple matches', () => {
    expect(matchPlaceId('Vietnam travel', places)).toBeNull();
    expect(matchPlaceId('Ha Long Bay and Hoi An', places)).toBeNull();
  });
});
