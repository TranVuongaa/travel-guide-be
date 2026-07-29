import {
  MAX_ARTICLE_VISIBLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DESTINATIONS_PER_PAGE,
  MAX_PLACE_CONTENT_LENGTH,
  MIN_ARTICLE_VISIBLE_LENGTH,
} from './travel-content-ingestions.constants';
import {
  ExtractedArticle,
  ExtractedDestination,
} from './interfaces/travel-content.interface';
import { normalizeSearchText } from '../../common/utils/search-text.util';

const GENERIC_HEADING_PATTERN =
  /^(?:giới thiệu|tổng quan|mục lục|kết luận|kinh nghiệm|lưu ý|địa điểm du lịch|du lịch|tham quan|top\s+\d+|những|các|giá vé|thời gian|giờ mở cửa|cách di chuyển|hướng dẫn|lịch trình|thông tin|địa chỉ|ăn gì|ở đâu)\b/iu;
const BOILERPLATE_PATTERN =
  /(?:cookie|đăng nhập|đăng ký|subscribe|newsletter|quảng cáo|advertisement|all rights reserved|chính sách bảo mật)/iu;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[*_>`~|]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function usefulParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/u)
    .map((block) =>
      cleanInlineMarkdown(
        block
          .split(/\r?\n/u)
          .filter((line) => !/^\s*(?:[-*]\s*)?!\[/u.test(line))
          .join(' '),
      ),
    )
    .filter(
      (paragraph) =>
        paragraph.length >= 60 &&
        !BOILERPLATE_PATTERN.test(paragraph) &&
        !/^(?:https?:\/\/|www\.)/iu.test(paragraph),
    );
}

function sourceAttribution(sourceName: string, url: string): string {
  return `<p>Nguồn: ${escapeHtml(sourceName)}. <a href="${escapeHtml(
    url,
  )}" target="_blank">Xem nội dung gốc</a>.</p>`;
}

export function extractArticle(
  markdown: string,
  fallbackDescription: string,
  sourceName: string,
  url: string,
): ExtractedArticle | null {
  const paragraphs = usefulParagraphs(markdown);
  const selected: string[] = [];
  let visibleLength = 0;
  for (const paragraph of paragraphs) {
    if (visibleLength >= MAX_ARTICLE_VISIBLE_LENGTH) break;
    const remaining = MAX_ARTICLE_VISIBLE_LENGTH - visibleLength;
    const bounded = paragraph.slice(0, remaining);
    selected.push(bounded);
    visibleLength += bounded.length;
    if (selected.length >= 8) break;
  }

  const fallback = cleanInlineMarkdown(fallbackDescription);
  const visibleText = selected.join(' ').trim() || fallback;
  if (visibleText.length < MIN_ARTICLE_VISIBLE_LENGTH) return null;

  const description = (fallback || selected[0] || 'Bài viết du lịch')
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .trim();
  const sections = selected
    .map((paragraph, index) =>
      index === 0
        ? `<h2>Tổng quan</h2><p>${escapeHtml(paragraph)}</p>`
        : `<p>${escapeHtml(paragraph)}</p>`,
    )
    .join('');

  return {
    description,
    content: `${sections}${sourceAttribution(sourceName, url)}`,
    visibleText,
  };
}

interface MarkdownSection {
  heading: string;
  body: string;
}

function markdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let heading = '';
  let body: string[] = [];

  const flush = (): void => {
    const cleanHeading = cleanInlineMarkdown(heading)
      .replace(/^\d+(?:\.\d+)*[.)-]?\s*/u, '')
      .trim();
    const cleanBody = usefulParagraphs(body.join('\n\n')).join(' ').trim();
    if (cleanHeading && cleanBody) {
      sections.push({ heading: cleanHeading, body: cleanBody });
    }
    body = [];
  };

  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^#{2,4}\s+(.+)$/u);
    if (match) {
      flush();
      heading = match[1];
    } else if (heading) {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function extractAddress(value: string): string | null {
  const match = value.match(
    /(?:địa chỉ|address)\s*[:：-]\s*([^.;\n]{8,200})/iu,
  );
  return match?.[1]?.trim() ?? null;
}

function extractCoordinates(value: string): {
  latitude: number | null;
  longitude: number | null;
} {
  const match = value.match(
    /(?:tọa độ|coordinates?)\s*[:：-]?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/iu,
  );
  if (!match) return { latitude: null, longitude: null };
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : { latitude: null, longitude: null };
}

export function extractDestinations(
  markdown: string,
  provinceName: string,
  sourceName: string,
  url: string,
): ExtractedDestination[] {
  if (
    !normalizeSearchText(markdown).includes(normalizeSearchText(provinceName))
  ) {
    return [];
  }
  const output: ExtractedDestination[] = [];
  for (const section of markdownSections(markdown)) {
    const name = section.heading
      .replace(/\s*[-–—|:]\s*(?:du lịch|địa điểm|tham quan).*$/iu, '')
      .trim();
    if (
      name.length < 3 ||
      name.length > 120 ||
      GENERIC_HEADING_PATTERN.test(name) ||
      section.body.length < 160
    ) {
      continue;
    }

    const matchingText = `${name} ${section.body} ${provinceName}`;
    const coordinates = extractCoordinates(section.body);
    const boundedBody = section.body.slice(0, MAX_PLACE_CONTENT_LENGTH);
    output.push({
      name,
      description: boundedBody.slice(0, MAX_DESCRIPTION_LENGTH),
      content: `<h2>Tổng quan</h2><p>${escapeHtml(
        boundedBody,
      )}</p>${sourceAttribution(sourceName, url)}`,
      address: extractAddress(section.body),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      matchingText,
    });
    if (output.length >= MAX_DESTINATIONS_PER_PAGE) break;
  }
  return output;
}
