import { NewsArticleCandidate } from './interfaces/travel-content.interface';
import { rankDiverseCandidates } from './travel-content.ranker';

function candidate(
  query: string,
  domain: string,
  rank: number,
): NewsArticleCandidate {
  return {
    title: `${query} ${rank}`,
    description: 'Travel destination guide',
    url: `https://${domain}/${query}-${rank}`,
    sourceName: domain,
    publishedAt: null,
    query,
    searchType: 'WEB',
    rank,
    provinceHint: null,
  };
}

describe('rankDiverseCandidates', () => {
  it('should alternate queries, cap domains, and obey the hard limit', () => {
    const ranked = rankDiverseCandidates(
      [
        ...Array.from({ length: 5 }, (_, index) =>
          candidate('hanoi', 'same.example', index + 1),
        ),
        candidate('danang', 'other.example', 1),
        candidate('hue', 'third.example', 1),
      ],
      5,
    );

    expect(ranked).toHaveLength(5);
    expect(ranked.slice(0, 3).map(({ query }) => query)).toEqual([
      'hanoi',
      'danang',
      'hue',
    ]);
    expect(
      ranked.filter(({ url }) => url.includes('same.example')),
    ).toHaveLength(3);
  });
});
