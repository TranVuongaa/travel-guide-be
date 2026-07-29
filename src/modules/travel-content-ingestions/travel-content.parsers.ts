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

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseNewsArticles(content: unknown): NewsArticleCandidate[] {
  const record = parseStructuredContent(content);
  const results = asRecord(record.results);
  if (!results) {
    throw new Error('Oxylabs Google News result is missing results');
  }

  const items = [...asArray(results.main)];
  for (const groupValue of asArray(results.additional)) {
    const group = asRecord(groupValue);
    if (group) items.push(...asArray(group.items));
  }

  return items.flatMap((value): NewsArticleCandidate[] => {
    const item = asRecord(value);
    if (!item) return [];
    const title = asString(item.title);
    const url = asString(item.url);
    if (!title || !url) return [];
    return [
      {
        title,
        url,
        description: asString(item.desc) ?? '',
        sourceName: asString(item.source),
        publishedAt: parseDate(item.published_at ?? item.date),
      },
    ];
  });
}
