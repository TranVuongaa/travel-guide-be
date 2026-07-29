import { TravelTrendType } from '@prisma/client';

export interface TravelContentIngestionJob {
  runId: string;
  requestedById: string;
}

export interface TrendKeywordCandidate {
  seedKeyword: string;
  keyword: string;
  trendType: TravelTrendType;
  value: number | null;
  formattedValue: string | null;
  sourceJobId: string | null;
  sourceLink: string | null;
}

export interface NewsArticleCandidate {
  title: string;
  description: string;
  url: string;
  sourceName: string | null;
  publishedAt: Date | null;
}

export interface ScrapedArticle {
  markdown: string;
  finalUrl: string;
}
