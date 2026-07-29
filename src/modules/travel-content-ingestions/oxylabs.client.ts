import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MAX_SEARCH_PAGES,
  MIN_ARTICLE_VISIBLE_LENGTH,
  SEARCH_RESULTS_PER_PAGE,
} from './travel-content-ingestions.constants';
import {
  NewsArticleCandidate,
  ScrapedArticle,
  TrendKeywordCandidate,
} from './interfaces/travel-content.interface';
import {
  parseSearchArticles,
  parseStructuredContent,
  parseTrendKeywords,
} from './travel-content.parsers';

interface OxylabsResult {
  content: unknown;
  job_id?: string | number;
  status_code?: number;
  url?: string;
}

interface OxylabsEnvelope {
  results?: OxylabsResult[];
  error?: { message?: string };
}

const REALTIME_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries';
const MAX_ATTEMPTS = 3;

class NonRetryableOxylabsError extends Error {}

@Injectable()
export class OxylabsClient {
  constructor(private readonly config: ConfigService) {}

  async getTrendKeywords(
    seedKeyword: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<TrendKeywordCandidate[]> {
    const results = await this.request({
      source: 'google_trends_explore',
      query: seedKeyword,
      geo_location: 'VN',
      context: [
        { key: 'search_type', value: 'web_search' },
        { key: 'date_from', value: dateFrom },
        { key: 'date_to', value: dateTo },
        { key: 'category_id', value: 67 },
      ],
    });
    return results.flatMap((result) =>
      parseTrendKeywords(
        result.content,
        seedKeyword,
        result.job_id === undefined ? null : String(result.job_id),
      ),
    );
  }

  async searchNews(keyword: string): Promise<NewsArticleCandidate[]> {
    const results = await this.request({
      source: 'google_search',
      query: `${keyword} travel destination Vietnam`,
      geo_location: 'Vietnam',
      locale: 'vi-VN',
      parse: true,
      pages: this.config.get<number>(
        'travelContentIngestion.searchPages',
        MAX_SEARCH_PAGES,
      ),
      limit: this.config.get<number>(
        'travelContentIngestion.searchResultsPerPage',
        SEARCH_RESULTS_PER_PAGE,
      ),
      context: [{ key: 'tbm', value: 'nws' }],
    });
    return results.flatMap((result) =>
      parseSearchArticles(result.content, {
        query: keyword,
        searchType: 'NEWS',
      }),
    );
  }

  async searchWeb(
    query: string,
    provinceHint: { id: string; name: string },
  ): Promise<NewsArticleCandidate[]> {
    const results = await this.request({
      source: 'google_search',
      query,
      geo_location: 'Vietnam',
      locale: 'vi-VN',
      parse: true,
      pages: this.config.get<number>(
        'travelContentIngestion.searchPages',
        MAX_SEARCH_PAGES,
      ),
      limit: this.config.get<number>(
        'travelContentIngestion.searchResultsPerPage',
        SEARCH_RESULTS_PER_PAGE,
      ),
    });
    return results.flatMap((result) =>
      parseSearchArticles(result.content, {
        query,
        searchType: 'WEB',
        provinceHint,
      }),
    );
  }

  async scrapeArticle(url: string): Promise<ScrapedArticle> {
    const firstResults = await this.request({
      source: 'universal',
      url,
      markdown: true,
    });
    let scraped = this.toScrapedArticle(firstResults, url);
    if (scraped.markdown.trim().length < MIN_ARTICLE_VISIBLE_LENGTH) {
      const renderedResults = await this.request({
        source: 'universal',
        url,
        markdown: true,
        render: 'html',
      });
      scraped = this.toScrapedArticle(renderedResults, url);
    }
    if (scraped.markdown.trim().length < MIN_ARTICLE_VISIBLE_LENGTH) {
      throw new Error('Oxylabs returned an empty article page');
    }
    return scraped;
  }

  private async request(
    payload: Record<string, unknown>,
  ): Promise<OxylabsResult[]> {
    const username = this.config.get<string>(
      'travelContentIngestion.oxylabsUsername',
    );
    const password = this.config.get<string>(
      'travelContentIngestion.oxylabsPassword',
    );
    if (!username || !password) {
      throw new Error('Oxylabs Web Scraper credentials are not configured');
    }
    const timeoutMs = this.config.get<number>(
      'travelContentIngestion.timeoutMs',
      120000,
    );
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(REALTIME_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = (await response.json()) as OxylabsEnvelope;
        if (!response.ok) {
          const message =
            body.error?.message ??
            `Oxylabs request failed with ${response.status}`;
          if (response.status !== 429 && response.status < 500) {
            throw new NonRetryableOxylabsError(message);
          }
          lastError = new Error(message);
        } else {
          const results = (body.results ?? []).filter(
            (result) => (result.status_code ?? 200) < 400,
          );
          if (!results.length) {
            throw new Error('Oxylabs returned no successful result');
          }
          return results;
        }
      } catch (error) {
        if (error instanceof NonRetryableOxylabsError) throw error;
        lastError =
          error instanceof Error ? error : new Error('Oxylabs request failed');
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * 2 ** (attempt - 1)),
        );
      }
    }
    throw lastError ?? new Error('Oxylabs request failed');
  }

  private toScrapedArticle(
    results: OxylabsResult[],
    fallbackUrl: string,
  ): ScrapedArticle {
    for (const result of results) {
      const contentRecord =
        typeof result.content === 'object' && result.content !== null
          ? parseStructuredContent(result.content)
          : null;
      const markdown =
        typeof result.content === 'string'
          ? result.content
          : typeof contentRecord?.markdown === 'string'
            ? contentRecord.markdown
            : '';
      if (markdown.trim()) {
        return { markdown, finalUrl: result.url ?? fallbackUrl };
      }
    }
    return { markdown: '', finalUrl: fallbackUrl };
  }
}
