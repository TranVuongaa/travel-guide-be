import { EntityImageSeedRecord } from './entity-image-seed.data';

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE_PAGE_URL = 'https://commons.wikimedia.org/wiki/';
const IMAGE_WIDTH = 1600;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const TITLES_PER_REQUEST = 10;
const USER_AGENT =
  'travel-guide-be-image-seed/1.0 (Wikimedia Commons metadata resolver)';

type Fetcher = typeof fetch;
type Delay = (milliseconds: number) => Promise<void>;

interface CommonsMetadataValue {
  value?: unknown;
}

interface CommonsImageInfo {
  thumburl?: unknown;
  url?: unknown;
  thumbwidth?: unknown;
  thumbheight?: unknown;
  width?: unknown;
  height?: unknown;
  mime?: unknown;
  mediatype?: unknown;
  extmetadata?: {
    Artist?: CommonsMetadataValue;
    LicenseShortName?: CommonsMetadataValue;
    LicenseUrl?: CommonsMetadataValue;
  };
}

interface CommonsPage {
  title?: unknown;
  missing?: unknown;
  imageinfo?: unknown;
}

export interface ResolvedEntityImage {
  seed: EntityImageSeedRecord;
  url: string;
  sourcePageUrl: string;
  author: string | null;
  licenseName: string;
  licenseUrl: string | null;
  width: number;
  height: number;
}

export class CommonsImageResolver {
  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch,
    private readonly delay: Delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async resolveAll(
    seeds: readonly EntityImageSeedRecord[],
  ): Promise<ResolvedEntityImage[]> {
    const resolved: ResolvedEntityImage[] = [];

    for (let offset = 0; offset < seeds.length; offset += TITLES_PER_REQUEST) {
      const chunk = seeds.slice(offset, offset + TITLES_PER_REQUEST);
      resolved.push(...(await this.resolveChunk(chunk)));
    }

    return resolved;
  }

  private async resolveChunk(
    seeds: readonly EntityImageSeedRecord[],
  ): Promise<ResolvedEntityImage[]> {
    const url = this.buildRequestUrl(seeds);
    const response = await this.fetchWithRetry(url);
    const payload: unknown = await response.json();
    const pages = this.getPages(payload);
    const pageByTitle = new Map(
      pages
        .filter(
          (page): page is CommonsPage & { title: string } =>
            typeof page.title === 'string',
        )
        .map((page) => [this.normalizeTitle(page.title), page]),
    );

    return seeds.map((seed) => {
      const page = pageByTitle.get(this.normalizeTitle(seed.fileTitle));
      if (!page || page.missing !== undefined) {
        throw new Error(`Commons file not found: ${seed.fileTitle}`);
      }

      return this.toResolvedImage(seed, page);
    });
  }

  private buildRequestUrl(seeds: readonly EntityImageSeedRecord[]): URL {
    const url = new URL(COMMONS_API_URL);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      titles: seeds.map(({ fileTitle }) => fileTitle).join('|'),
      iiprop: 'url|mime|size|mediatype|extmetadata',
      iiurlwidth: String(IMAGE_WIDTH),
      iiextmetadatalanguage: 'en',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    }).toString();
    return url;
  }

  private async fetchWithRetry(url: URL): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetcher(url, {
          headers: {
            accept: 'application/json',
            'user-agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          return response;
        }
        if (response.status !== 429 && response.status < 500) {
          throw new Error(
            `Commons request failed with HTTP ${response.status}`,
          );
        }
        lastError = new Error(
          `Commons request failed with HTTP ${response.status}`,
        );
      } catch (error) {
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS) {
        await this.delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Commons request failed');
  }

  private getPages(payload: unknown): CommonsPage[] {
    if (!this.isRecord(payload)) {
      throw new Error('Commons returned a malformed response');
    }
    const query = payload.query;
    if (!this.isRecord(query) || !Array.isArray(query.pages)) {
      throw new Error('Commons returned a malformed query response');
    }
    return query.pages.filter((page) => this.isRecord(page));
  }

  private toResolvedImage(
    seed: EntityImageSeedRecord,
    page: CommonsPage,
  ): ResolvedEntityImage {
    if (!Array.isArray(page.imageinfo) || page.imageinfo.length !== 1) {
      throw new Error(`Commons image metadata missing: ${seed.fileTitle}`);
    }
    const info = page.imageinfo[0] as CommonsImageInfo;
    const imageUrl =
      typeof info.thumburl === 'string' ? info.thumburl : info.url;
    const width =
      typeof info.thumbwidth === 'number' ? info.thumbwidth : info.width;
    const height =
      typeof info.thumbheight === 'number' ? info.thumbheight : info.height;
    const licenseName = this.metadataString(info.extmetadata?.LicenseShortName);

    if (
      typeof imageUrl !== 'string' ||
      !this.isAllowedImageUrl(imageUrl) ||
      typeof info.mime !== 'string' ||
      !this.isRasterMimeType(info.mime) ||
      info.mediatype !== 'BITMAP' ||
      typeof width !== 'number' ||
      width <= 0 ||
      typeof height !== 'number' ||
      height <= 0 ||
      !licenseName
    ) {
      throw new Error(`Commons image metadata invalid: ${seed.fileTitle}`);
    }

    const licenseUrlValue = this.metadataString(info.extmetadata?.LicenseUrl);
    const licenseUrl = this.normalizeHttpsUrl(licenseUrlValue);
    if (licenseUrlValue && !licenseUrl) {
      throw new Error(`Commons license URL invalid: ${seed.fileTitle}`);
    }

    const pageTitle =
      typeof page.title === 'string' ? page.title : seed.fileTitle;

    return {
      seed,
      url: imageUrl,
      sourcePageUrl: `${COMMONS_FILE_PAGE_URL}${encodeURIComponent(
        pageTitle.replaceAll(' ', '_'),
      )}`,
      author: this.cleanHtml(this.metadataString(info.extmetadata?.Artist)),
      licenseName,
      licenseUrl,
      width,
      height,
    };
  }

  private metadataString(
    metadata: CommonsMetadataValue | undefined,
  ): string | null {
    return typeof metadata?.value === 'string' && metadata.value.trim()
      ? metadata.value.trim()
      : null;
  }

  private cleanHtml(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const withoutTags = value.replace(/<[^>]*>/g, ' ');
    const decoded = withoutTags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, code: string) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return decoded || null;
  }

  private normalizeTitle(value: string): string {
    return value.replaceAll('_', ' ').normalize('NFC');
  }

  private isAllowedImageUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' && url.hostname === 'upload.wikimedia.org'
      );
    } catch {
      return false;
    }
  }

  private normalizeHttpsUrl(value: string | null): string | null {
    if (!value) {
      return null;
    }
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      if (url.protocol === 'http:') {
        url.protocol = 'https:';
      }
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  private isRasterMimeType(value: string): boolean {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
