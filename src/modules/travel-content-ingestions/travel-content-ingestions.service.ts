import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  PostSource,
  Prisma,
  TravelContentIngestionRun,
  TravelContentIngestionStatus,
  TravelTrendType,
} from '@prisma/client';
import { Queue } from 'bullmq';

import {
  TravelContentIngestionActiveException,
  TravelContentIngestionNotFoundException,
  TravelContentIngestionQueueUnavailableException,
} from '../../common/exceptions/travel-content-ingestion.exceptions';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { sanitizeArticleHtml } from '../../common/utils/article-html-sanitizer';
import { normalizeSearchText } from '../../common/utils/search-text.util';
import { PrismaService } from '../../database/prisma.service';
import {
  MAX_ARTICLES,
  MAX_DESCRIPTION_LENGTH,
  MAX_ERROR_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TREND_KEYWORDS,
  RUN_TRAVEL_CONTENT_INGESTION_JOB,
  TRAVEL_CONTENT_INGESTION_QUEUE,
  TRAVEL_TREND_SEEDS,
} from './travel-content-ingestions.constants';
import { TravelContentIngestionRunResponseDto } from './dto/travel-content-ingestion-response.dto';
import { QueryTravelContentIngestionDto } from './dto/query-travel-content-ingestion.dto';
import {
  NewsArticleCandidate,
  TravelContentIngestionJob,
  TrendKeywordCandidate,
} from './interfaces/travel-content.interface';
import { OxylabsClient } from './oxylabs.client';
import { matchPlaceId } from './place-matcher';
import { assertPublicDns, canonicalizePublicUrl } from './url-safety.util';

interface RunCounters {
  trendKeywordCount: number;
  discoveredUrlCount: number;
  importedPostCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
}

@Injectable()
export class TravelContentIngestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oxylabs: OxylabsClient,
    @InjectQueue(TRAVEL_CONTENT_INGESTION_QUEUE)
    private readonly queue: Queue<TravelContentIngestionJob>,
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

    try {
      await this.queue.add(
        RUN_TRAVEL_CONTENT_INGESTION_JOB,
        { runId: run.id, requestedById },
        {
          jobId: run.id,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch {
      await this.prisma.travelContentIngestionRun.update({
        where: { id: run.id },
        data: {
          status: TravelContentIngestionStatus.FAILED,
          failedCount: 1,
          errorSummary: 'The ingestion job could not be queued',
          completedAt: new Date(),
        },
      });
      throw new TravelContentIngestionQueueUnavailableException();
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

  async execute(runId: string, requestedById: string): Promise<void> {
    const claimed = await this.prisma.travelContentIngestionRun.updateMany({
      where: { id: runId, status: TravelContentIngestionStatus.QUEUED },
      data: {
        status: TravelContentIngestionStatus.RUNNING,
        startedAt: new Date(),
      },
    });
    if (claimed.count === 0) return;

    const counters: RunCounters = {
      trendKeywordCount: 0,
      discoveredUrlCount: 0,
      importedPostCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
    const errors: string[] = [];

    try {
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

      const selectedKeywords = this.selectTrendKeywords(trendKeywords);
      if (!selectedKeywords.length) {
        throw new Error('No usable travel trend keywords were returned');
      }

      const articles = new Map<string, NewsArticleCandidate>();
      for (const keyword of selectedKeywords) {
        try {
          for (const article of await this.oxylabs.searchNews(keyword)) {
            try {
              const url = canonicalizePublicUrl(article.url);
              if (!articles.has(url) && articles.size < MAX_ARTICLES) {
                articles.set(url, { ...article, url });
              }
            } catch {
              counters.skippedCount += 1;
            }
          }
        } catch (error) {
          counters.failedCount += 1;
          errors.push(
            this.errorMessage(`News search "${keyword}" failed`, error),
          );
        }
      }
      counters.discoveredUrlCount = articles.size;

      const existingPlaces = await this.prisma.place.findMany({
        where: { status: ContentStatus.PUBLISHED },
        select: { id: true, name: true },
      });

      for (const article of articles.values()) {
        await this.importArticle(
          runId,
          requestedById,
          article,
          existingPlaces,
          counters,
          errors,
        );
      }
    } catch (error) {
      counters.failedCount += 1;
      errors.push(this.errorMessage('Ingestion failed', error));
    }

    const status =
      counters.failedCount === 0
        ? TravelContentIngestionStatus.COMPLETED
        : counters.importedPostCount > 0
          ? TravelContentIngestionStatus.PARTIAL
          : TravelContentIngestionStatus.FAILED;
    await this.prisma.travelContentIngestionRun.update({
      where: { id: runId },
      data: {
        status,
        ...counters,
        errorSummary: this.joinErrors(errors),
        completedAt: new Date(),
      },
    });
  }

  private async importArticle(
    runId: string,
    requestedById: string,
    article: NewsArticleCandidate,
    places: { id: string; name: string }[],
    counters: RunCounters,
    errors: string[],
  ): Promise<void> {
    try {
      if (
        await this.prisma.post.findUnique({
          where: { externalSourceUrl: article.url },
          select: { id: true },
        })
      ) {
        counters.duplicateCount += 1;
        return;
      }
      await assertPublicDns(article.url);
      const scraped = await this.oxylabs.scrapeArticle(article.url);
      const finalUrl = canonicalizePublicUrl(scraped.finalUrl);
      await assertPublicDns(finalUrl);
      const description = this.createDescription(
        article.description,
        scraped.markdown,
      );
      if (
        !this.isRelevant(`${article.title} ${description} ${scraped.markdown}`)
      ) {
        counters.skippedCount += 1;
        return;
      }
      const placeId = matchPlaceId(
        `${article.title} ${description} ${scraped.markdown.slice(0, 20000)}`,
        places,
      );
      const sourceName = article.sourceName ?? new URL(finalUrl).hostname;
      const content = sanitizeArticleHtml(
        `<p>${this.escapeHtml(description)}</p><p>Source: ${this.escapeHtml(
          sourceName,
        )}. <a href="${this.escapeHtml(
          finalUrl,
        )}" target="_blank">Read the original article</a>.</p>`,
        'Post content',
      );

      await this.prisma.post.create({
        data: {
          authorId: requestedById,
          placeId,
          title: article.title.slice(0, MAX_TITLE_LENGTH),
          description,
          content,
          source: PostSource.SYSTEM,
          status: ContentStatus.DRAFT,
          ingestionRunId: runId,
          externalSourceUrl: finalUrl,
          externalSourceName: sourceName,
          externalPublishedAt: article.publishedAt,
        },
      });
      counters.importedPostCount += 1;
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

  private createRequestParameters(): Prisma.JsonObject {
    const { dateFrom, dateTo } = this.createDateRange();
    return {
      seeds: [...TRAVEL_TREND_SEEDS],
      geo: 'VN',
      searchType: 'web_search',
      categoryId: 67,
      dateFrom,
      dateTo,
      maxTrendKeywords: MAX_TREND_KEYWORDS,
      maxArticles: MAX_ARTICLES,
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
      if (selected.size >= MAX_TREND_KEYWORDS) break;
    }
    return [...selected.values()];
  }

  private createDescription(description: string, markdown: string): string {
    const text = (description || markdown)
      .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/[#*_>`~|-]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    return text.slice(0, MAX_DESCRIPTION_LENGTH) || 'Travel article';
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
      'tham quan',
    ].some((term) => normalized.includes(term));
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
      trendKeywordCount: run.trendKeywordCount,
      discoveredUrlCount: run.discoveredUrlCount,
      importedPostCount: run.importedPostCount,
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
