import { normalizeSearchText } from '../../common/utils/search-text.util';

export interface MatchablePlace {
  id: string;
  name: string;
}

export function matchPlaceId(
  text: string,
  places: MatchablePlace[],
): string | null {
  const normalizedText = ` ${normalizeSearchText(text)} `;
  const matches = places.filter((place) => {
    const normalizedName = normalizeSearchText(place.name);
    return (
      normalizedName.length >= 3 &&
      normalizedText.includes(` ${normalizedName} `)
    );
  });
  return matches.length === 1 ? matches[0].id : null;
}
