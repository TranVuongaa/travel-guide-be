import { load, type CheerioAPI } from 'cheerio';

import { sanitizeArticleHtml } from '../../common/utils/article-html-sanitizer';
import { normalizeSearchText } from '../../common/utils/search-text.util';
import {
  MAX_ARTICLE_BLOCKS,
  MAX_ARTICLE_HTML_LENGTH,
  MAX_ARTICLE_IMAGES,
  MAX_ARTICLE_VISIBLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DESTINATIONS_PER_PAGE,
  MAX_PLACE_BLOCKS,
  MAX_PLACE_CONTENT_LENGTH,
  MAX_PLACE_IMAGES,
  MIN_ARTICLE_VISIBLE_LENGTH,
} from './travel-content-ingestions.constants';
import {
  ExtractedArticle,
  ExtractedDestination,
  ScrapedArticle,
} from './interfaces/travel-content.interface';
import { canonicalizePublicUrl } from './url-safety.util';

const GENERIC_HEADING_PATTERN =
  /^(?:giới thiệu|tổng quan|mục lục|kết luận|cẩm nang|kinh nghiệm|lưu ý|địa điểm du lịch|du lịch|tham quan|top\s+\d+|những|các|giá vé|thời gian|giờ mở cửa|cách di chuyển|hướng dẫn|lịch trình|thông tin|địa chỉ|ăn gì|ở đâu)\b/iu;
const BOILERPLATE_PATTERN =
  /(?:cookie|đăng nhập|đăng ký|subscribe|newsletter|quảng cáo|advertisement|all rights reserved|chính sách bảo mật)/iu;
const REMOVE_ELEMENT_PATTERN =
  /(?:^|[-_\s])(?:advert|ads?|banner|breadcrumb|comment|cookie|footer|header|menu|modal|newsletter|pagination|popup|promo|related|share|sidebar|social|subscribe)(?:$|[-_\s])/iu;
const REJECT_IMAGE_PATTERN =
  /(?:^|[-_/.\s])(?:advert|ads?|avatar|badge|banner|icon|logo|pixel|placeholder|promo|share|social|spacer|sprite|tracking)(?:$|[-_/.\s])/iu;
const ARTICLE_BLOCK_SELECTOR =
  'h1, h2, h3, h4, p, ul, ol, blockquote, pre, figure, img';
const ARTICLE_CONTAINER_SELECTORS = [
  '[itemprop="articleBody"]',
  'article',
  '.article-content',
  '.article-body',
  '.post-content',
  '.entry-content',
  '.content-detail',
  '.detail-content',
  'main',
  '[role="main"]',
] as const;
const REMOVED_TAGS =
  'script, style, noscript, template, svg, canvas, iframe, frame, object, embed, form, input, button, select, textarea, nav, header, footer, aside, dialog';

type CheerioSelection = ReturnType<CheerioAPI>;
export type ImageUrlValidator = (url: string) => Promise<void>;
const ALLOW_IMAGE_URL: ImageUrlValidator = () => Promise.resolve();

interface RichArticleBody {
  content: string;
  visibleText: string;
  blockCount: number;
  imageCount: number;
}

interface HtmlSection {
  heading: string;
  bodyHtml: string;
  bodyText: string;
  blockCount: number;
  imageCount: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function cleanInlineMarkdown(value: string): string {
  return normalizedText(
    value
      .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/[*_>`~|]+/gu, ' '),
  );
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
  )}" target="_blank" rel="noopener noreferrer">Xem nội dung gốc</a>.</p>`;
}

function descriptionFrom(
  fallbackDescription: string,
  visibleText: string,
): string {
  return (
    cleanInlineMarkdown(fallbackDescription) ||
    visibleText.slice(0, MAX_DESCRIPTION_LENGTH) ||
    'Bài viết du lịch'
  )
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .trim();
}

function removePageChrome($: CheerioAPI): void {
  $(REMOVED_TAGS).remove();
  $('*').each((_index, element) => {
    const selected = $(element);
    const marker = normalizedText(
      `${selected.attr('class') ?? ''} ${selected.attr('id') ?? ''} ${
        selected.attr('role') ?? ''
      }`,
    );
    if (
      selected.attr('hidden') !== undefined ||
      selected.attr('aria-hidden') === 'true' ||
      (marker && REMOVE_ELEMENT_PATTERN.test(marker))
    ) {
      selected.remove();
    }
  });
}

function scoreArticleContainer(
  $: CheerioAPI,
  candidate: CheerioSelection,
): number {
  const text = normalizedText(candidate.text());
  if (text.length < MIN_ARTICLE_VISIBLE_LENGTH) return Number.NEGATIVE_INFINITY;
  const linkTextLength = normalizedText(candidate.find('a').text()).length;
  const linkRatio = linkTextLength / Math.max(text.length, 1);
  const blockCount = candidate.find('p, li, h1, h2, h3, h4').length;
  const imageCount = candidate.find('img').length;
  const boilerplatePenalty = BOILERPLATE_PATTERN.test(text) ? 2000 : 0;
  return (
    Math.min(text.length, MAX_ARTICLE_VISIBLE_LENGTH * 2) +
    Math.min(blockCount, MAX_ARTICLE_BLOCKS * 2) * 100 +
    Math.min(imageCount, MAX_ARTICLE_IMAGES) * 40 -
    linkRatio * 8000 -
    boilerplatePenalty
  );
}

function selectArticleContainer($: CheerioAPI): CheerioSelection | null {
  const seen = new Set<object>();
  const candidates: CheerioSelection[] = [];
  for (const selector of ARTICLE_CONTAINER_SELECTORS) {
    $(selector).each((_index, element) => {
      if (seen.has(element)) return;
      seen.add(element);
      candidates.push($(element));
    });
  }
  if (!candidates.length) candidates.push($('body'));
  let selected: CheerioSelection | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreArticleContainer($, candidate);
    if (score > selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return Number.isFinite(selectedScore) ? selected : null;
}

function resolveLink(
  value: string | undefined,
  baseUrl: string,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return canonicalizePublicUrl(url.toString());
  } catch {
    return null;
  }
}

function parseDimension(value: string | undefined): number | null {
  if (!value || !/^\d{1,5}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function largestSrcsetCandidate(value: string | undefined): string | null {
  if (!value) return null;
  const candidates = value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/u)[0])
    .filter(Boolean);
  return candidates.at(-1) ?? null;
}

function imageSource(image: CheerioSelection): string | null {
  return (
    image.attr('src') ||
    image.attr('data-src') ||
    image.attr('data-lazy-src') ||
    largestSrcsetCandidate(image.attr('srcset')) ||
    largestSrcsetCandidate(image.attr('data-srcset'))
  );
}

async function normalizeImages(
  $: CheerioAPI,
  root: CheerioSelection,
  baseUrl: string,
  imageLimit: number,
  seenImageUrls: Set<string>,
  validateImageUrl: ImageUrlValidator,
): Promise<number> {
  let retained = 0;
  const images = root.find('img').addBack('img').toArray();
  for (const element of images) {
    const image = $(element);
    const candidate = imageSource(image);
    const width = parseDimension(image.attr('width'));
    const height = parseDimension(image.attr('height'));
    const marker = normalizedText(
      `${candidate ?? ''} ${image.attr('class') ?? ''} ${
        image.attr('id') ?? ''
      } ${image.attr('alt') ?? ''} ${image.attr('title') ?? ''}`,
    );
    let normalizedUrl: string | null = null;
    try {
      const resolved = candidate ? new URL(candidate, baseUrl) : null;
      if (
        !resolved ||
        resolved.protocol !== 'https:' ||
        resolved.username ||
        resolved.password ||
        /\.svg(?:z)?$/iu.test(resolved.pathname) ||
        REJECT_IMAGE_PATTERN.test(marker) ||
        (width !== null && width < 50) ||
        (height !== null && height < 50)
      ) {
        throw new Error('Image is not eligible');
      }
      normalizedUrl = canonicalizePublicUrl(resolved.toString());
      if (
        seenImageUrls.has(normalizedUrl) ||
        seenImageUrls.size >= imageLimit
      ) {
        throw new Error('Image limit reached');
      }
      await validateImageUrl(normalizedUrl);
    } catch {
      image.remove();
      continue;
    }

    seenImageUrls.add(normalizedUrl);
    retained += 1;
    const alt = normalizedText(image.attr('alt') ?? '');
    const title = normalizedText(image.attr('title') ?? '');
    image.attr({
      src: normalizedUrl,
      ...(alt ? { alt } : {}),
      ...(title ? { title } : {}),
      ...(width ? { width: String(width) } : {}),
      ...(height ? { height: String(height) } : {}),
      loading: 'lazy',
    });
    for (const attribute of Object.keys(image.attr() ?? {})) {
      if (
        !['src', 'alt', 'title', 'width', 'height', 'loading'].includes(
          attribute,
        )
      ) {
        image.removeAttr(attribute);
      }
    }
  }
  root.find('figure').each((_index, element) => {
    const figure = $(element);
    if (!figure.find('img').length && !normalizedText(figure.text())) {
      figure.remove();
    }
  });
  return retained;
}

function normalizeLinksAndAttributes(
  $: CheerioAPI,
  root: CheerioSelection,
  baseUrl: string,
): void {
  root
    .find('a')
    .addBack('a')
    .each((_index, element) => {
      const link = $(element);
      const href = resolveLink(link.attr('href'), baseUrl);
      const title = normalizedText(link.attr('title') ?? '');
      for (const attribute of Object.keys(link.attr() ?? {})) {
        link.removeAttr(attribute);
      }
      if (href) {
        link.attr({
          href,
          ...(title ? { title } : {}),
          target: '_blank',
          rel: 'noopener noreferrer',
        });
      }
    });
  root
    .find('*')
    .addBack()
    .each((_index, element) => {
      const selected = $(element);
      if (selected.is('a, img')) return;
      for (const attribute of Object.keys(selected.attr() ?? {})) {
        selected.removeAttr(attribute);
      }
    });
}

function topLevelArticleBlocks(
  $: CheerioAPI,
  container: CheerioSelection,
): CheerioSelection[] {
  const blocks: CheerioSelection[] = [];
  container.find(ARTICLE_BLOCK_SELECTOR).each((_index, element) => {
    const block = $(element);
    const hasBlockAncestor = block
      .parents(ARTICLE_BLOCK_SELECTOR)
      .toArray()
      .some((ancestor) =>
        container.toArray().some((root) => $.contains(root, ancestor)),
      );
    if (hasBlockAncestor) return;
    blocks.push(block);
  });
  return blocks;
}

async function extractRichArticleBody(
  rawHtml: string,
  baseUrl: string,
  validateImageUrl: ImageUrlValidator,
): Promise<RichArticleBody | null> {
  if (!rawHtml.trim()) return null;
  const $ = load(rawHtml);
  removePageChrome($);
  const container = selectArticleContainer($);
  if (!container) return null;

  const selectedBlocks: string[] = [];
  const visibleParts: string[] = [];
  const seenImageUrls = new Set<string>();
  let imageCount = 0;
  let htmlLength = 0;
  let visibleLength = 0;

  for (const sourceBlock of topLevelArticleBlocks($, container)) {
    if (selectedBlocks.length >= MAX_ARTICLE_BLOCKS) break;
    const fragment = load($.html(sourceBlock), undefined, false);
    const block = fragment.root().children().first();
    if (!block.length) continue;
    if (block.is('h1')) {
      block.replaceWith(`<h2>${block.html() ?? ''}</h2>`);
    }
    fragment(REMOVED_TAGS).remove();
    normalizeLinksAndAttributes(fragment, fragment.root(), baseUrl);
    const seenBeforeBlock = new Set(seenImageUrls);
    const retainedImages = await normalizeImages(
      fragment,
      fragment.root(),
      baseUrl,
      MAX_ARTICLE_IMAGES,
      seenImageUrls,
      validateImageUrl,
    );

    const blockHtml = fragment.html().trim();
    const blockText = normalizedText(fragment.root().text());
    if (!blockHtml || (!blockText && !fragment('img').length)) continue;
    if (
      visibleLength + blockText.length > MAX_ARTICLE_VISIBLE_LENGTH ||
      htmlLength + blockHtml.length > MAX_ARTICLE_HTML_LENGTH
    ) {
      seenImageUrls.clear();
      for (const imageUrl of seenBeforeBlock) seenImageUrls.add(imageUrl);
      break;
    }
    selectedBlocks.push(blockHtml);
    imageCount += retainedImages;
    if (blockText) visibleParts.push(blockText);
    visibleLength += blockText.length;
    htmlLength += blockHtml.length;
  }

  const visibleText = normalizedText(visibleParts.join(' '));
  if (visibleText.length < MIN_ARTICLE_VISIBLE_LENGTH) return null;
  return {
    content: selectedBlocks.join(''),
    visibleText,
    blockCount: selectedBlocks.length,
    imageCount,
  };
}

function extractMarkdownFallback(markdown: string): RichArticleBody | null {
  const selected: string[] = [];
  let visibleLength = 0;
  for (const paragraph of usefulParagraphs(markdown)) {
    if (selected.length >= MAX_ARTICLE_BLOCKS) break;
    if (visibleLength + paragraph.length > MAX_ARTICLE_VISIBLE_LENGTH) break;
    selected.push(paragraph);
    visibleLength += paragraph.length;
  }
  const visibleText = normalizedText(selected.join(' '));
  if (visibleText.length < MIN_ARTICLE_VISIBLE_LENGTH) return null;
  return {
    content: selected
      .map((paragraph, index) =>
        index === 0
          ? `<h2>Tổng quan</h2><p>${escapeHtml(paragraph)}</p>`
          : `<p>${escapeHtml(paragraph)}</p>`,
      )
      .join(''),
    visibleText,
    blockCount: selected.length + 1,
    imageCount: 0,
  };
}

export async function extractArticle(
  scraped: ScrapedArticle,
  fallbackDescription: string,
  sourceName: string,
  url: string,
  validateImageUrl: ImageUrlValidator = ALLOW_IMAGE_URL,
): Promise<ExtractedArticle | null> {
  const body =
    (await extractRichArticleBody(scraped.rawHtml, url, validateImageUrl)) ??
    extractMarkdownFallback(scraped.markdown);
  if (!body) return null;
  const content = sanitizeArticleHtml(
    `${body.content}${sourceAttribution(sourceName, url)}`,
    'Post content',
  );
  return {
    description: descriptionFrom(fallbackDescription, body.visibleText),
    content,
    visibleText: body.visibleText,
    blockCount: body.blockCount,
    imageCount: body.imageCount,
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

function htmlSections(articleHtml: string, sourceUrl: string): HtmlSection[] {
  if (!articleHtml.trim()) return [];
  const $ = load(articleHtml, undefined, false);
  $('p').each((_index, element) => {
    const paragraph = $(element);
    if (
      /^Nguồn:/iu.test(normalizedText(paragraph.text())) &&
      paragraph.find(`a[href="${sourceUrl}"]`).length
    ) {
      paragraph.remove();
    }
  });
  const output: HtmlSection[] = [];
  $('h2, h3, h4').each((_index, element) => {
    const heading = normalizedText($(element).text())
      .replace(/^\d+(?:\.\d+)*[.)-]?\s*/u, '')
      .trim();
    const bodyNodes = $(element).nextUntil('h2, h3, h4');
    const bodyParts: string[] = [];
    let visibleLength = 0;
    let blockCount = 0;
    let imageCount = 0;
    for (const node of bodyNodes.toArray()) {
      if (blockCount >= MAX_PLACE_BLOCKS) break;
      const selected = $(node).clone();
      const nodeText = normalizedText(selected.text());
      const nodeImages = selected.find('img').addBack('img');
      if (imageCount >= MAX_PLACE_IMAGES) nodeImages.remove();
      else if (imageCount + nodeImages.length > MAX_PLACE_IMAGES) {
        nodeImages.slice(MAX_PLACE_IMAGES - imageCount).remove();
      }
      const retainedImages = selected.find('img').addBack('img').length;
      const html = $.html(selected).trim();
      if (!html || visibleLength + nodeText.length > MAX_PLACE_CONTENT_LENGTH) {
        break;
      }
      bodyParts.push(html);
      visibleLength += nodeText.length;
      imageCount += retainedImages;
      blockCount += 1;
    }
    const bodyHtml = bodyParts.join('');
    const bodyText = normalizedText(load(bodyHtml, undefined, false).text());
    if (heading && bodyText) {
      output.push({
        heading,
        bodyHtml,
        bodyText,
        blockCount,
        imageCount,
      });
    }
  });
  return output;
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

function destinationName(heading: string): string {
  return heading
    .replace(/\s*[-–—|:]\s*(?:du lịch|địa điểm|tham quan).*$/iu, '')
    .trim();
}

function qualifiesDestination(
  name: string,
  body: string,
  provinceName: string,
): boolean {
  return (
    name.length >= 3 &&
    name.length <= 120 &&
    !GENERIC_HEADING_PATTERN.test(name) &&
    body.length >= 160 &&
    normalizeSearchText(`${name} ${body}`).includes(
      normalizeSearchText(provinceName),
    )
  );
}

export function extractDestinations(
  markdown: string,
  provinceName: string,
  sourceName: string,
  url: string,
  articleHtml = '',
): ExtractedDestination[] {
  if (
    !normalizeSearchText(`${markdown} ${articleHtml}`).includes(
      normalizeSearchText(provinceName),
    )
  ) {
    return [];
  }

  const richOutput: ExtractedDestination[] = [];
  for (const section of htmlSections(articleHtml, url)) {
    const name = destinationName(section.heading);
    if (!qualifiesDestination(name, section.bodyText, provinceName)) continue;
    const coordinates = extractCoordinates(section.bodyText);
    richOutput.push({
      name,
      description: section.bodyText.slice(0, MAX_DESCRIPTION_LENGTH),
      content: sanitizeArticleHtml(
        `<h2>${escapeHtml(section.heading)}</h2>${section.bodyHtml}${sourceAttribution(
          sourceName,
          url,
        )}`,
        'Destination content',
      ),
      address: extractAddress(section.bodyText),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      matchingText: `${name} ${section.bodyText} ${provinceName}`,
      blockCount: section.blockCount + 1,
      imageCount: section.imageCount,
    });
    if (richOutput.length >= MAX_DESTINATIONS_PER_PAGE) break;
  }
  if (richOutput.length) return richOutput;

  const output: ExtractedDestination[] = [];
  for (const section of markdownSections(markdown)) {
    const name = destinationName(section.heading);
    if (!qualifiesDestination(name, section.body, provinceName)) continue;
    const matchingText = `${name} ${section.body} ${provinceName}`;
    const coordinates = extractCoordinates(section.body);
    const boundedBody = section.body.slice(0, MAX_PLACE_CONTENT_LENGTH);
    output.push({
      name,
      description: boundedBody.slice(0, MAX_DESCRIPTION_LENGTH),
      content: sanitizeArticleHtml(
        `<h2>Tổng quan</h2><p>${escapeHtml(
          boundedBody,
        )}</p>${sourceAttribution(sourceName, url)}`,
        'Destination content',
      ),
      address: extractAddress(section.body),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      matchingText,
      blockCount: 2,
      imageCount: 0,
    });
    if (output.length >= MAX_DESTINATIONS_PER_PAGE) break;
  }
  return output;
}
