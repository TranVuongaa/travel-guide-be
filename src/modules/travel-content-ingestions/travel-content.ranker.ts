import { normalizeSearchText } from '../../common/utils/search-text.util';
import { NewsArticleCandidate } from './interfaces/travel-content.interface';

function candidateScore(candidate: NewsArticleCandidate): number {
  const typeScore = candidate.searchType === 'WEB' ? 20 : 10;
  const recencyScore = candidate.publishedAt ? 10 : 0;
  const descriptionScore = Math.min(candidate.description.length / 100, 5);
  return typeScore + recencyScore + descriptionScore - (candidate.rank ?? 100);
}

export function rankDiverseCandidates(
  candidates: NewsArticleCandidate[],
  limit: number,
): NewsArticleCandidate[] {
  const groups = new Map<string, NewsArticleCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizeSearchText(
      candidate.query ?? candidate.searchType ?? '',
    );
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => candidateScore(right) - candidateScore(left));
  }

  const output: NewsArticleCandidate[] = [];
  const domainCounts = new Map<string, number>();
  while (output.length < limit && [...groups.values()].some(Boolean)) {
    let added = false;
    for (const group of groups.values()) {
      while (group.length) {
        const candidate = group.shift();
        if (!candidate) break;
        const domain = new URL(candidate.url).hostname.toLowerCase();
        if ((domainCounts.get(domain) ?? 0) >= 3) continue;
        output.push(candidate);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        added = true;
        break;
      }
      if (output.length >= limit) break;
    }
    if (!added) break;
  }
  return output;
}
