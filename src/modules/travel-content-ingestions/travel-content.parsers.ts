import { TravelTrendType } from '@prisma/client';

import {
  NewsArticleCandidate,
  TrendKeywordCandidate,
} from './interfaces/travel-content.interface';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function asRank(value: unknown, fallback: number): number {
  return asInteger(value) ?? fallback;
}

export function parseStructuredContent(value: unknown): UnknownRecord {
  const parsed =
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  const record = asRecord(parsed);
  if (!record) {
    throw new Error('Oxylabs returned malformed structured content');
  }
  return record;
}

export function parseTrendKeywords(
  content: unknown,
  seedKeyword: string,
  sourceJobId: string | null,
): TrendKeywordCandidate[] {
  const record = parseStructuredContent(content);
  const related = record.related_queries;
  const output: TrendKeywordCandidate[] = [];

  const addItems = (value: unknown, type: TravelTrendType): void => {
    for (const itemValue of asArray(value)) {
      const item = asRecord(itemValue);
      if (!item) continue;
      const keyword = asString(item.query) ?? asString(item.keyword);
      if (!keyword) continue;
      output.push({
        seedKeyword,
        keyword,
        trendType: type,
        value: asInteger(item.value),
        formattedValue: asString(item.formatted_value),
        sourceJobId,
        sourceLink: asString(item.link),
      });
    }
  };

  const relatedRecord = asRecord(related);
  if (relatedRecord) {
    addItems(relatedRecord.top, TravelTrendType.TOP);
    addItems(relatedRecord.rising, TravelTrendType.RISING);
  }

  for (const groupValue of asArray(related)) {
    const group = asRecord(groupValue);
    if (!group) continue;
    const label = (
      asString(group.type) ??
      asString(group.title) ??
      ''
    ).toLowerCase();
    addItems(
      group.items,
      label.includes('rising') ? TravelTrendType.RISING : TravelTrendType.TOP,
    );
  }

  return output;
}

function parseDate(value: unknown, now = new Date()): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date;

  const normalized = text.toLowerCase();
  const relative = normalized.match(
    /(\d+)\s*(minute|hour|day|week|month|year|phút|giờ|ngày|tuần|tháng|năm)s?\s*(?:ago|trước)?/u,
  );
  if (!relative) return null;
  const amount = Number(relative[1]);
  const unit = relative[2];
  const milliseconds: Record<string, number> = {
    minute: 60_000,
    phút: 60_000,
    hour: 3_600_000,
    giờ: 3_600_000,
    day: 86_400_000,
    ngày: 86_400_000,
    week: 604_800_000,
    tuần: 604_800_000,
    month: 2_592_000_000,
    tháng: 2_592_000_000,
    year: 31_536_000_000,
    năm: 31_536_000_000,
  };
  return new Date(now.getTime() - amount * milliseconds[unit]);
}

interface ParseSearchOptions {
  query?: string;
  searchType?: 'NEWS' | 'WEB';
  provinceHint?: {
    id: string;
    name: string;
  } | null;
  now?: Date;
}

function additionalItems(value: unknown): unknown[] {
  const groups = Array.isArray(value) ? value : value ? [value] : [];
  return groups.flatMap((groupValue) => {
    const group = asRecord(groupValue);
    return group ? asArray(group.items) : [];
  });
}

export function parseSearchArticles(
  content: unknown,
  options: ParseSearchOptions = {},
): NewsArticleCandidate[] {
  const record = parseStructuredContent(content);
  const results = asRecord(record.results);
  if (!results) {
    throw new Error('Oxylabs Google Search result is missing results');
  }

  const items = [
    ...asArray(results.main),
    ...additionalItems(results.additional),
    ...asArray(results.organic),
  ];

  return items.flatMap((value, index): NewsArticleCandidate[] => {
    const item = asRecord(value);
    if (!item) return [];
    const title = asString(item.title);
    const url = asString(item.url);
    if (!title || !url) return [];
    const source = asRecord(item.source);
    return [
      {
        title,
        url,
        description: asString(item.desc) ?? asString(item.description) ?? '',
        sourceName:
          asString(item.source) ??
          asString(source?.name) ??
          asString(item.domain),
        publishedAt: parseDate(
          item.published_at ??
            item.date ??
            item.relative_publish_date ??
            item.published,
          options.now,
        ),
        query: options.query,
        searchType: options.searchType,
        rank: asRank(item.pos_overall ?? item.pos, index + 1),
        provinceHint: options.provinceHint ?? null,
      },
    ];
  });
}

export function parseNewsArticles(content: unknown): NewsArticleCandidate[] {
  return parseSearchArticles(content, { searchType: 'NEWS' });
}
