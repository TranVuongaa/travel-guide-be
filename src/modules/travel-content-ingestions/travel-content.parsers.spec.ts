import { TravelTrendType } from '@prisma/client';

import {
  parseNewsArticles,
  parseTrendKeywords,
} from './travel-content.parsers';

describe('travel content parsers', () => {
  it('should parse top and rising trend query groups', () => {
    const result = parseTrendKeywords(
      JSON.stringify({
        related_queries: {
          top: [{ query: 'Vietnam travel', value: 90 }],
          rising: [
            {
              query: 'new Vietnam destination',
              value: 120,
              formatted_value: 'Breakout',
            },
          ],
        },
      }),
      'travel',
      'job-1',
    );

    expect(result).toEqual([
      expect.objectContaining({
        keyword: 'Vietnam travel',
        trendType: TravelTrendType.TOP,
      }),
      expect.objectContaining({
        keyword: 'new Vietnam destination',
        trendType: TravelTrendType.RISING,
      }),
    ]);
  });

  it('should parse main and additional Google News results', () => {
    const result = parseNewsArticles({
      results: {
        main: [
          {
            title: 'Travel Vietnam',
            url: 'https://example.com/main',
            desc: 'Guide',
            source: 'Example',
          },
        ],
        additional: [
          {
            items: [
              {
                title: 'Destination guide',
                url: 'https://example.com/additional',
              },
            ],
          },
        ],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        title: 'Travel Vietnam',
        sourceName: 'Example',
      }),
    );
  });

  it('should reject malformed structured content', () => {
    expect(() => parseNewsArticles('[]')).toThrow(
      'malformed structured content',
    );
  });
});
