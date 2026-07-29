import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentStatus,
  PostSource,
  Prisma,
  TravelContentIngestionRun,
  TravelContentIngestionStatus,
  TravelTrendType,
} from '@prisma/client';
import { randomUUID } from 'crypto';

import {
  TravelContentIngestionActiveException,
  TravelContentIngestionNotFoundException,
} from '../../common/exceptions/travel-content-ingestion.exceptions';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  articleVisibleText,
  sanitizeArticleHtml,
} from '../../common/utils/article-html-sanitizer';
import { normalizeSearchText } from '../../common/utils/search-text.util';
import { toSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { QueryTravelContentIngestionDto } from './dto/query-travel-content-ingestion.dto';
import { TravelContentIngestionRunResponseDto } from './dto/travel-content-ingestion-response.dto';
import {
  ExtractedDestination,
  NewsArticleCandidate,
  TrendKeywordCandidate,
} from './interfaces/travel-content.interface';
import { OxylabsClient } from './oxylabs.client';
import {
  MatchableCategory,
  MatchableIngestionPlace,
  matchDestinationPlace,
  matchPlaceId,
  resolveCategoryIds,
} from './place-matcher';
import {
  MAX_CANDIDATE_URLS,
  MAX_ARTICLE_BLOCKS,
  MAX_ARTICLE_HTML_LENGTH,
  MAX_ARTICLE_IMAGES,
  MAX_ARTICLE_VISIBLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_ERROR_SUMMARY_LENGTH,
  MAX_PLACE_BLOCKS,
  MAX_PLACE_CONTENT_LENGTH,
  MAX_PLACE_IMAGES,
  MAX_PLACES,
  MAX_POSTS,
  MAX_PROVINCE_QUERIES,
  MAX_SEARCH_PAGES,
  MAX_TITLE_LENGTH,
  MAX_TREND_KEYWORDS,
  MIN_POST_REFRESH_GROWTH_RATIO,
  MIN_POST_REFRESH_VISIBLE_GROWTH,
  SEARCH_RESULTS_PER_PAGE,
  TRAVEL_FALLBACK_QUERIES,
  TRAVEL_TREND_SEEDS,
} from './travel-content-ingestions.constants';
import {
  extractArticle,
  extractDestinations,
} from './travel-content.extractor';
import { rankDiverseCandidates } from './travel-content.ranker';
import { assertPublicDns, canonicalizePublicUrl } from './url-safety.util';

interface RunCounters {
  trendKeywordCount: number;
  discoveredUrlCount: number;
  discoveredPlaceCount: number;
  importedPlaceCount: number;
  updatedPlaceCount: number;
  updatedPostCount: number;
  importedPostCount: number;
  publishedPostCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
}

interface ProvinceReference {
  id: string;
  name: string;
}

interface PlaceWriteResult extends MatchableIngestionPlace {
  action: 'CREATED' | 'UPDATED' | 'UNCHANGED';
}

interface ArticleWriteResult {
  postAction: 'CREATED' | 'UPDATED' | 'DUPLICATE';
  places: PlaceWriteResult[];
}

@Injectable()
export class TravelContentIngestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oxylabs: OxylabsClient,
    private readonly config: ConfigService,
  ) {}

  async createRun(
    requestedById: string,
  ): Promise<TravelContentIngestionRunResponseDto> {
    const active = await this.prisma.travelContentIngestionRun.findFirst({
      where: {
        status: {
          in: [
            TravelContentIngestionStatus.QUEUED,
            TravelContentIngestionStatus.RUNNING,
          ],
        },
      },
      select: { id: true },
    });
    if (active) throw new TravelContentIngestionActiveException();

    const parameters = this.createRequestParameters();
    let run: TravelContentIngestionRun;
    try {
      run = await this.prisma.travelContentIngestionRun.create({
        data: {
          requestedById,
          requestParameters: parameters,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new TravelContentIngestionActiveException();
      }
      throw error;
    }

    if (process.env.NODE_ENV !== 'test') {
      setImmediate(() => {
        void this.execute(run.id, requestedById).catch(() => undefined);
      });
    }

    return this.toRunResponse(run);
  }

  async findOne(id: string): Promise<TravelContentIngestionRunResponseDto> {
    const run = await this.prisma.travelContentIngestionRun.findUnique({
      where: { id },
    });
    if (!run) throw new TravelContentIngestionNotFoundException(id);
    return this.toRunResponse(run);
  }

  async findAll(
    query: QueryTravelContentIngestionDto,
  ): Promise<PaginatedResult<TravelContentIngestionRunResponseDto>> {
    const where: Prisma.TravelContentIngestionRunWhereInput = query.status
      ? { status: query.status }
      : {};
    const [runs, totalItems] = await this.prisma.$transaction([
      this.prisma.travelContentIngestionRun.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
      }),
      this.prisma.travelContentIngestionRun.count({ where }),
    ]);
    return {
      items: runs.map((run) => this.toRunResponse(run)),
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async execute(runId: string, requestedById: string): Promise<boolean> {
    const now = new Date();
    const leaseToken = randomUUID();
    const claimed = await this.prisma.travelContentIngestionRun.updateMany({
      where: {
        id: runId,
        requestedById,
        attemptCount: { lt: this.maxAttempts() },
        OR: [
          { status: TravelContentIngestionStatus.QUEUED },
          {
            status: TravelContentIngestionStatus.RUNNING,
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
          },
        ],
      },
      data: {
        status: TravelContentIngestionStatus.RUNNING,
        startedAt: now,
        completedAt: null,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs()),
        attemptCount: { increment: 1 },
      },
    });
    if (claimed.count === 0) return false;

    const counters = await this.createCounters(runId);
    const errors: string[] = [];
    const heartbeat = setInterval(() => {
      void this.extendLease(runId, leaseToken);
    }, this.heartbeatIntervalMs());
    heartbeat.unref();

    try {
      try {
        const references = await this.loadReferences();
        const selectedKeywords = await this.discoverTrendKeywords(
          runId,
          counters,
          errors,
        );
        const candidates = await this.discoverArticles(
          selectedKeywords,
          references.provinces,
          counters,
          errors,
        );

        for (const article of candidates) {
          if (counters.publishedPostCount >= this.maxPosts()) break;
          await this.importArticle(
            runId,
            requestedById,
            article,
            references.places,
            references.categories,
            counters,
            errors,
          );
        }
      } catch (error) {
        counters.failedCount += 1;
        errors.push(this.errorMessage('Ingestion failed', error));
      }

      if (
        counters.publishedPostCount === 0 &&
        counters.updatedPostCount === 0 &&
        counters.importedPlaceCount === 0 &&
        counters.updatedPlaceCount === 0
      ) {
        counters.failedCount += 1;
        errors.push(
          'No public travel content passed the ingestion quality gates',
        );
      }

      const hasPublicItems =
        counters.publishedPostCount > 0 ||
        counters.updatedPostCount > 0 ||
        counters.importedPlaceCount > 0 ||
        counters.updatedPlaceCount > 0;
      const status =
        counters.failedCount === 0 && hasPublicItems
          ? TravelContentIngestionStatus.COMPLETED
          : hasPublicItems
            ? TravelContentIngestionStatus.PARTIAL
            : TravelContentIngestionStatus.FAILED;
      await this.prisma.travelContentIngestionRun.updateMany({
        where: {
          id: runId,
          status: TravelContentIngestionStatus.RUNNING,
          leaseToken,
        },
        data: {
          status,
          ...counters,
          errorSummary: this.joinErrors(errors),
          completedAt: new Date(),
          leaseExpiresAt: null,
          leaseToken: null,
        },
      });
      return true;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async discoverTrendKeywords(
    runId: string,
    counters: RunCounters,
    errors: string[],
  ): Promise<string[]> {
    const { dateFrom, dateTo } = this.createDateRange();
    const trendKeywords: TrendKeywordCandidate[] = [];
    for (const seed of TRAVEL_TREND_SEEDS) {
      try {
        const discovered = await this.oxylabs.getTrendKeywords(
          seed,
          dateFrom,
          dateTo,
        );
        const inserted = await this.prisma.travelTrendKeyword.createMany({
          data: discovered.map((keyword) => ({
            runId,
            ...keyword,
          })),
          skipDuplicates: true,
        });
        counters.trendKeywordCount += inserted.count;
        trendKeywords.push(...discovered);
      } catch (error) {
        counters.failedCount += 1;
        errors.push(this.errorMessage(`Trend seed "${seed}" failed`, error));
      }
    }
    return this.selectTrendKeywords(trendKeywords);
  }

  private async discoverArticles(
    keywords: string[],
    provinces: ProvinceReference[],
    counters: RunCounters,
    errors: string[],
  ): Promise<NewsArticleCandidate[]> {
    const candidates: NewsArticleCandidate[] = [];
    for (const keyword of keywords) {
      try {
        candidates.push(...(await this.oxylabs.searchNews(keyword)));
      } catch (error) {
        counters.failedCount += 1;
        errors.push(
          this.errorMessage(`News search "${keyword}" failed`, error),
        );
      }
    }

    for (const province of provinces.slice(0, this.maxProvinceQueries())) {
      const query = `địa điểm du lịch ${province.name}`;
      try {
        candidates.push(...(await this.oxylabs.searchWeb(query, province)));
      } catch (error) {
        counters.failedCount += 1;
        errors.push(this.errorMessage(`Web search "${query}" failed`, error));
      }
    }

    const canonical = new Map<string, NewsArticleCandidate>();
    for (const candidate of candidates) {
      try {
        const url = canonicalizePublicUrl(candidate.url);
        if (!canonical.has(url)) canonical.set(url, { ...candidate, url });
      } catch {
        counters.skippedCount += 1;
      }
    }
    const ranked = rankDiverseCandidates(
      [...canonical.values()],
      this.maxCandidateUrls(),
    );
    counters.discoveredUrlCount = ranked.length;
    return ranked;
  }

  private async importArticle(
    runId: string,
    requestedById: string,
    article: NewsArticleCandidate,
    places: MatchableIngestionPlace[],
    categories: MatchableCategory[],
    counters: RunCounters,
    errors: string[],
  ): Promise<void> {
    try {
      await assertPublicDns(article.url);
      const scraped = await this.oxylabs.scrapeArticle(article.url);
      const finalUrl = canonicalizePublicUrl(scraped.finalUrl);
      await assertPublicDns(finalUrl);

      const sourceName = article.sourceName ?? new URL(finalUrl).hostname;
      const extracted = await extractArticle(
        scraped,
        article.description,
        sourceName,
        finalUrl,
        assertPublicDns,
      );
      if (
        !extracted ||
        !this.isRelevant(
          `${article.title} ${extracted.description} ${extracted.visibleText}`,
        )
      ) {
        counters.skippedCount += 1;
        return;
      }

      const destinations = article.provinceHint
        ? extractDestinations(
            scraped.markdown,
            article.provinceHint.name,
            sourceName,
            finalUrl,
            extracted.content,
          )
        : [];
      counters.discoveredPlaceCount += destinations.length;
      const remainingPlaces = Math.max(
        0,
        this.maxPlaces() - counters.importedPlaceCount,
      );
      const preparedDestinations = destinations
        .map((destination) => ({
          destination,
          categoryIds: resolveCategoryIds(destination.matchingText, categories),
        }))
        .filter(({ categoryIds }) => {
          if (categoryIds.length) return true;
          counters.skippedCount += 1;
          return false;
        })
        .slice(0, remainingPlaces);

      const matchedPlaceId = matchPlaceId(
        `${article.title} ${extracted.visibleText.slice(0, 20000)}`,
        places,
      );
      const result = await this.persistArticle(
        runId,
        requestedById,
        article,
        finalUrl,
        sourceName,
        extracted.description,
        extracted.content,
        matchedPlaceId,
        article.provinceHint ?? null,
        preparedDestinations,
        places,
      );

      if (result.postAction === 'DUPLICATE') {
        counters.duplicateCount += 1;
      } else if (result.postAction === 'UPDATED') {
        counters.updatedPostCount += 1;
      } else {
        counters.importedPostCount += 1;
        counters.publishedPostCount += 1;
      }
      for (const place of result.places) {
        if (place.action === 'CREATED') counters.importedPlaceCount += 1;
        if (place.action === 'UPDATED') counters.updatedPlaceCount += 1;
        const index = places.findIndex(({ id }) => id === place.id);
        if (index >= 0) places[index] = place;
        else places.push(place);
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        counters.duplicateCount += 1;
        return;
      }
      counters.failedCount += 1;
      errors.push(this.errorMessage('Article import failed', error));
    }
  }

  private async persistArticle(
    runId: string,
    requestedById: string,
    article: NewsArticleCandidate,
    finalUrl: string,
    sourceName: string,
    description: string,
    content: string,
    matchedPlaceId: string | null,
    provinceHint: ProvinceReference | null,
    destinations: Array<{
      destination: ExtractedDestination;
      categoryIds: string[];
    }>,
    places: MatchableIngestionPlace[],
  ): Promise<ArticleWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const existingPost = await transaction.post.findFirst({
        where: {
          externalSourceUrl: {
            in: [...new Set([article.url, finalUrl])],
          },
        },
        select: {
          id: true,
          content: true,
          source: true,
          ingestionRunId: true,
          placeId: true,
          deletedAt: true,
        },
      });

      const placeResults: PlaceWriteResult[] = [];
      if (provinceHint) {
        for (const prepared of destinations) {
          const place = await this.upsertDestination(
            transaction,
            runId,
            requestedById,
            finalUrl,
            sourceName,
            article.publishedAt,
            provinceHint,
            prepared.destination,
            prepared.categoryIds,
            places,
          );
          placeResults.push(place);
        }
      }

      const placeId = matchedPlaceId ?? placeResults[0]?.id ?? null;
      const sanitizedContent = sanitizeArticleHtml(content, 'Post content');
      if (existingPost) {
        const oldVisibleLength = articleVisibleText(
          existingPost.content,
        ).length;
        const newVisibleLength = articleVisibleText(sanitizedContent).length;
        const canRefresh =
          existingPost.source === PostSource.SYSTEM &&
          existingPost.ingestionRunId !== null &&
          existingPost.deletedAt === null &&
          newVisibleLength >=
            oldVisibleLength + MIN_POST_REFRESH_VISIBLE_GROWTH &&
          newVisibleLength >=
            Math.ceil(oldVisibleLength * MIN_POST_REFRESH_GROWTH_RATIO);
        if (!canRefresh) {
          return { postAction: 'DUPLICATE', places: placeResults };
        }
        await transaction.post.update({
          where: { id: existingPost.id },
          data: {
            description: description.slice(0, MAX_DESCRIPTION_LENGTH),
            content: sanitizedContent,
            placeId: existingPost.placeId ?? placeId ?? undefined,
          },
        });
        return { postAction: 'UPDATED', places: placeResults };
      }

      await transaction.post.create({
        data: {
          authorId: requestedById,
          placeId,
          title: article.title.slice(0, MAX_TITLE_LENGTH),
          description: description.slice(0, MAX_DESCRIPTION_LENGTH),
          content: sanitizedContent,
          source: PostSource.SYSTEM,
          status: ContentStatus.PUBLISHED,
          ingestionRunId: runId,
          externalSourceUrl: finalUrl,
          externalSourceName: sourceName,
          externalPublishedAt: article.publishedAt,
        },
      });
      return { postAction: 'CREATED', places: placeResults };
    });
  }

  private async upsertDestination(
    transaction: Prisma.TransactionClient,
    runId: string,
    requestedById: string,
    sourceUrl: string,
    sourceName: string,
    externalUpdatedAt: Date | null,
    province: ProvinceReference,
    destination: ExtractedDestination,
    categoryIds: string[],
    places: MatchableIngestionPlace[],
  ): Promise<PlaceWriteResult> {
    const existing = matchDestinationPlace(
      destination.name,
      province.id,
      places,
    );
    const content = sanitizeArticleHtml(
      destination.content,
      'Destination content',
    );
    if (existing) {
      const improvesDescription =
        destination.description.length > existing.description.length + 100;
      const improvesContent = content.length > existing.content.length + 200;
      const improvesAddress = !existing.address && destination.address;
      const improvesCoordinates =
        (existing.latitude === null && destination.latitude !== null) ||
        (existing.longitude === null && destination.longitude !== null);
      const action =
        improvesDescription ||
        improvesContent ||
        Boolean(improvesAddress) ||
        improvesCoordinates
          ? 'UPDATED'
          : 'UNCHANGED';
      const updated = await transaction.place.update({
        where: { id: existing.id },
        data: {
          description: improvesDescription
            ? destination.description
            : undefined,
          content: improvesContent ? content : undefined,
          address: improvesAddress ? destination.address : undefined,
          latitude:
            existing.latitude === null && destination.latitude !== null
              ? destination.latitude
              : undefined,
          longitude:
            existing.longitude === null && destination.longitude !== null
              ? destination.longitude
              : undefined,
          status: ContentStatus.PUBLISHED,
          ingestionRunId: runId,
          externalSourceUrl: sourceUrl,
          externalSourceName: sourceName,
          externalUpdatedAt: externalUpdatedAt ?? new Date(),
        },
        select: {
          id: true,
          name: true,
          provinceId: true,
          description: true,
          content: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      });
      await transaction.placeCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          placeId: existing.id,
          categoryId,
        })),
        skipDuplicates: true,
      });
      return { ...updated, action };
    }

    const slug = await this.createUniquePlaceSlug(
      transaction,
      destination.name,
    );
    const created = await transaction.place.create({
      data: {
        name: destination.name,
        slug,
        description: destination.description,
        content,
        address: destination.address,
        latitude: destination.latitude,
        longitude: destination.longitude,
        provinceId: province.id,
        createdById: requestedById,
        status: ContentStatus.PUBLISHED,
        ingestionRunId: runId,
        externalSourceUrl: sourceUrl,
        externalSourceName: sourceName,
        externalUpdatedAt: externalUpdatedAt ?? new Date(),
      },
      select: {
        id: true,
        name: true,
        provinceId: true,
        description: true,
        content: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });
    await transaction.placeCategory.createMany({
      data: categoryIds.map((categoryId) => ({
        placeId: created.id,
        categoryId,
      })),
      skipDuplicates: true,
    });
    return { ...created, action: 'CREATED' };
  }

  private async loadReferences(): Promise<{
    provinces: ProvinceReference[];
    categories: MatchableCategory[];
    places: MatchableIngestionPlace[];
  }> {
    const [provinceRows, categories, places] = await Promise.all([
      this.prisma.province.findMany({
        select: {
          id: true,
          name: true,
          places: {
            where: { status: ContentStatus.PUBLISHED },
            select: { id: true },
          },
        },
      }),
      this.prisma.category.findMany({
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.place.findMany({
        where: { status: ContentStatus.PUBLISHED },
        select: {
          id: true,
          name: true,
          provinceId: true,
          description: true,
          content: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      }),
    ]);
    const provinces = provinceRows
      .sort(
        (left, right) =>
          left.places.length - right.places.length ||
          left.name.localeCompare(right.name, 'vi'),
      )
      .map(({ id, name }) => ({ id, name }));
    return { provinces, categories, places };
  }

  private async createUniquePlaceSlug(
    transaction: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const baseSlug = toSlug(name, 'destination');
    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
      const existing = await transaction.place.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) return slug;
    }
    throw new Error(`Could not create a unique Place slug for "${name}"`);
  }

  private async createCounters(runId: string): Promise<RunCounters> {
    const [trendKeywordCount, publishedPostCount, persistedPlaceCount] =
      await Promise.all([
        this.prisma.travelTrendKeyword.count({ where: { runId } }),
        this.prisma.post.count({
          where: {
            ingestionRunId: runId,
            status: ContentStatus.PUBLISHED,
            deletedAt: null,
          },
        }),
        this.prisma.place.count({
          where: {
            ingestionRunId: runId,
            status: ContentStatus.PUBLISHED,
          },
        }),
      ]);
    return {
      trendKeywordCount,
      discoveredUrlCount: 0,
      discoveredPlaceCount: persistedPlaceCount,
      importedPlaceCount: persistedPlaceCount,
      updatedPlaceCount: 0,
      updatedPostCount: 0,
      importedPostCount: publishedPostCount,
      publishedPostCount,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  private createRequestParameters(): Prisma.JsonObject {
    const { dateFrom, dateTo } = this.createDateRange();
    return {
      seeds: [...TRAVEL_TREND_SEEDS],
      fallbackQueries: [...TRAVEL_FALLBACK_QUERIES],
      geo: 'VN',
      searchType: 'web_search',
      categoryId: 67,
      dateFrom,
      dateTo,
      maxTrendKeywords: this.maxTrendKeywords(),
      maxCandidateUrls: this.maxCandidateUrls(),
      maxPosts: this.maxPosts(),
      maxPlaces: this.maxPlaces(),
      maxProvinceQueries: this.maxProvinceQueries(),
      articleVisibleCharacterLimit: MAX_ARTICLE_VISIBLE_LENGTH,
      articleHtmlCharacterLimit: MAX_ARTICLE_HTML_LENGTH,
      articleBlockLimit: MAX_ARTICLE_BLOCKS,
      articleImageLimit: MAX_ARTICLE_IMAGES,
      placeVisibleCharacterLimit: MAX_PLACE_CONTENT_LENGTH,
      placeBlockLimit: MAX_PLACE_BLOCKS,
      placeImageLimit: MAX_PLACE_IMAGES,
      searchPages: this.config.get<number>(
        'travelContentIngestion.searchPages',
        MAX_SEARCH_PAGES,
      ),
      searchResultsPerPage: this.config.get<number>(
        'travelContentIngestion.searchResultsPerPage',
        SEARCH_RESULTS_PER_PAGE,
      ),
    };
  }

  private createDateRange(): { dateFrom: string; dateTo: string } {
    const dateTo = new Date();
    const dateFrom = new Date(dateTo);
    dateFrom.setUTCFullYear(dateFrom.getUTCFullYear() - 1);
    return {
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: dateTo.toISOString().slice(0, 10),
    };
  }

  private selectTrendKeywords(candidates: TrendKeywordCandidate[]): string[] {
    const sorted = [...candidates].sort(
      (left, right) =>
        Number(right.trendType === TravelTrendType.RISING) -
          Number(left.trendType === TravelTrendType.RISING) ||
        (right.value ?? 0) - (left.value ?? 0),
    );
    const selected = new Map<string, string>();
    for (const candidate of sorted) {
      const key = normalizeSearchText(candidate.keyword);
      if (key && !selected.has(key)) selected.set(key, candidate.keyword);
      if (selected.size >= this.maxTrendKeywords()) break;
    }
    for (const fallback of TRAVEL_FALLBACK_QUERIES) {
      if (selected.size >= this.maxTrendKeywords()) break;
      const key = normalizeSearchText(fallback);
      if (!selected.has(key)) selected.set(key, fallback);
    }
    return [...selected.values()];
  }

  private isRelevant(value: string): boolean {
    const normalized = normalizeSearchText(value);
    return [
      'travel',
      'destination',
      'tourism',
      'places to visit',
      'things to do',
      'du lich',
      'dia diem',
      'diem den',
      'tham quan',
      'kinh nghiem',
    ].some((term) => normalized.includes(term));
  }

  private maxTrendKeywords(): number {
    return this.config.get<number>(
      'travelContentIngestion.maxTrendKeywords',
      MAX_TREND_KEYWORDS,
    );
  }

  private maxCandidateUrls(): number {
    return this.config.get<number>(
      'travelContentIngestion.maxCandidateUrls',
      MAX_CANDIDATE_URLS,
    );
  }

  private maxPosts(): number {
    return this.config.get<number>(
      'travelContentIngestion.maxPosts',
      MAX_POSTS,
    );
  }

  private maxPlaces(): number {
    return this.config.get<number>(
      'travelContentIngestion.maxPlaces',
      MAX_PLACES,
    );
  }

  private maxProvinceQueries(): number {
    return this.config.get<number>(
      'travelContentIngestion.maxProvinceQueries',
      MAX_PROVINCE_QUERIES,
    );
  }

  private maxAttempts(): number {
    return this.config.get<number>('travelContentIngestion.maxAttempts', 3);
  }

  private leaseDurationMs(): number {
    return this.config.get<number>(
      'travelContentIngestion.leaseDurationMs',
      300000,
    );
  }

  private heartbeatIntervalMs(): number {
    return this.config.get<number>(
      'travelContentIngestion.heartbeatIntervalMs',
      30000,
    );
  }

  private async extendLease(runId: string, leaseToken: string): Promise<void> {
    await this.prisma.travelContentIngestionRun
      .updateMany({
        where: {
          id: runId,
          status: TravelContentIngestionStatus.RUNNING,
          leaseToken,
        },
        data: {
          leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs()),
        },
      })
      .catch(() => undefined);
  }

  private errorMessage(prefix: string, error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `${prefix}: ${message}`.slice(0, 300);
  }

  private joinErrors(errors: string[]): string | null {
    if (!errors.length) return null;
    return errors.join('; ').slice(0, MAX_ERROR_SUMMARY_LENGTH);
  }

  private toRunResponse(
    run: TravelContentIngestionRun,
  ): TravelContentIngestionRunResponseDto {
    const terminalStatuses: ReadonlySet<TravelContentIngestionStatus> = new Set(
      [
        TravelContentIngestionStatus.COMPLETED,
        TravelContentIngestionStatus.PARTIAL,
        TravelContentIngestionStatus.FAILED,
      ],
    );
    const isTerminal = terminalStatuses.has(run.status);
    return {
      id: run.id,
      status: run.status,
      requestParameters: this.toJsonObject(run.requestParameters),
      isTerminal,
      pollAfterMs: isTerminal ? null : 3000,
      attemptCount: run.attemptCount,
      trendKeywordCount: run.trendKeywordCount,
      discoveredUrlCount: run.discoveredUrlCount,
      discoveredPlaceCount: run.discoveredPlaceCount,
      importedPlaceCount: run.importedPlaceCount,
      updatedPlaceCount: run.updatedPlaceCount,
      updatedPostCount: run.updatedPostCount,
      importedPostCount: run.importedPostCount,
      publishedPostCount: run.publishedPostCount,
      duplicateCount: run.duplicateCount,
      skippedCount: run.skippedCount,
      failedCount: run.failedCount,
      errorSummary: run.errorSummary,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  private toJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : {};
  }
}
