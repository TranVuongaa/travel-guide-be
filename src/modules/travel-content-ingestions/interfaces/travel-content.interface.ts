import { TravelTrendType } from '@prisma/client';

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
  query?: string;
  searchType?: 'NEWS' | 'WEB';
  rank?: number;
  provinceHint?: {
    id: string;
    name: string;
  } | null;
}

export interface ScrapedArticle {
  markdown: string;
  finalUrl: string;
}

export interface ExtractedArticle {
  description: string;
  content: string;
  visibleText: string;
}

export interface ExtractedDestination {
  name: string;
  description: string;
  content: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  matchingText: string;
}
