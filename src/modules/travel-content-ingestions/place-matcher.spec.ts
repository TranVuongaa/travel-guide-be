import { matchPlaceId } from './place-matcher';

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

  it('should return null for no match or multiple matches', () => {
    expect(matchPlaceId('Vietnam travel', places)).toBeNull();
    expect(matchPlaceId('Ha Long Bay and Hoi An', places)).toBeNull();
  });
});
