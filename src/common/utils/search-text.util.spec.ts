import { normalizeSearchText } from './search-text.util';

describe('normalizeSearchText', () => {
  it.each([
    ['Đà Nẵng', 'da nang'],
    ['ĐÀ NẴNG', 'da nang'],
    ['da nang', 'da nang'],
    ['Biển & đảo / bien-dao', 'bien dao bien dao'],
    ['traveler@example.com', 'traveler example com'],
    ['  Quần   thể di tích Cố đô Huế  ', 'quan the di tich co do hue'],
  ])('should normalize "%s" to "%s"', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('should return an empty string for whitespace-only input', () => {
    expect(normalizeSearchText(' \t \n ')).toBe('');
  });
});
