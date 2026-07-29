import { normalizeSearchText } from '../../common/utils/search-text.util';

export interface MatchablePlace {
  id: string;
  name: string;
}

export interface MatchableIngestionPlace extends MatchablePlace {
  provinceId: string;
  description: string;
  content: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MatchableCategory {
  id: string;
  name: string;
  slug: string;
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

export function matchDestinationPlace(
  name: string,
  provinceId: string,
  places: MatchableIngestionPlace[],
): MatchableIngestionPlace | null {
  const normalizedName = normalizeSearchText(name);
  const matches = places.filter(
    (place) =>
      place.provinceId === provinceId &&
      normalizeSearchText(place.name) === normalizedName,
  );
  return matches.length === 1 ? matches[0] : null;
}

const CATEGORY_KEYWORDS: ReadonlyArray<{
  slug: string;
  keywords: readonly string[];
}> = [
  { slug: 'bien-dao', keywords: ['bien', 'dao', 'bai tam', 'vinh'] },
  {
    slug: 'nui-cao-nguyen',
    keywords: ['nui', 'cao nguyen', 'deo', 'dinh'],
  },
  {
    slug: 'thien-nhien',
    keywords: ['thien nhien', 'thac', 'hang dong', 'ho', 'vuon quoc gia'],
  },
  {
    slug: 'di-tich-lich-su',
    keywords: ['di tich', 'lich su', 'bao tang', 'co do'],
  },
  { slug: 'van-hoa', keywords: ['van hoa', 'pho co', 'le hoi'] },
  {
    slug: 'tam-linh',
    keywords: ['chua', 'den', 'dinh', 'nha tho', 'tam linh'],
  },
  { slug: 'am-thuc', keywords: ['am thuc', 'mon an', 'dac san', 'cho dem'] },
  {
    slug: 'sinh-thai',
    keywords: ['sinh thai', 'rung', 'khu bao ton', 'vuon'],
  },
  { slug: 'nghi-duong', keywords: ['nghi duong', 'resort', 'suoi khoang'] },
  {
    slug: 'phieu-luu',
    keywords: ['phieu luu', 'trekking', 'leo nui', 'kayak'],
  },
  {
    slug: 'vui-choi-giai-tri',
    keywords: ['vui choi', 'giai tri', 'cong vien', 'khu du lich'],
  },
  { slug: 'lang-nghe', keywords: ['lang nghe', 'thu cong', 'truyen thong'] },
];

export function resolveCategoryIds(
  text: string,
  categories: MatchableCategory[],
): string[] {
  const normalized = normalizeSearchText(text);
  const directMatches = categories.filter((category) => {
    const name = normalizeSearchText(category.name);
    return (
      normalized.includes(name) ||
      CATEGORY_KEYWORDS.find(
        (mapping) =>
          mapping.slug === category.slug &&
          mapping.keywords.some((keyword) => normalized.includes(keyword)),
      ) !== undefined
    );
  });
  return [...new Set(directMatches.map(({ id }) => id))];
}
