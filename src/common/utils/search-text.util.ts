const COMBINING_MARKS_PATTERN = /\p{M}+/gu;
const VIETNAMESE_D_PATTERN = /đ/gu;
const SEPARATOR_PATTERN = /[^a-z0-9]+/gu;

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .toLocaleLowerCase('vi')
    .replace(COMBINING_MARKS_PATTERN, '')
    .replace(VIETNAMESE_D_PATTERN, 'd')
    .replace(SEPARATOR_PATTERN, ' ')
    .trim();
}
