import { describe, it, expect } from 'vitest';
import { __test__ } from '../orchestrator';
import type { NewsArticle } from '../providers/base';

const { isUsable, tokenize, jaccard, deduplicate, qualityScore, rankByQuality } = __test__;

function makeArticle(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    title: 'Default title',
    description: 'A short description that is long enough.',
    url: 'https://example.com/article',
    urlToImage: 'https://example.com/img.jpg',
    publishedAt: new Date().toISOString(),
    sourceName: 'Example',
    providerName: 'NewsAPI',
    ...overrides,
  };
}

describe('isUsable', () => {
  it('rejects [Removed] title', () => {
    expect(isUsable(makeArticle({ title: '[Removed]' }))).toBe(false);
  });

  it('rejects null urlToImage', () => {
    expect(isUsable(makeArticle({ urlToImage: null }))).toBe(false);
  });

  it('rejects empty description', () => {
    expect(isUsable(makeArticle({ description: '' }))).toBe(false);
  });

  it('rejects description < 30 chars', () => {
    expect(isUsable(makeArticle({ description: 'tiny' }))).toBe(false);
  });

  it('rejects invalid URL', () => {
    expect(isUsable(makeArticle({ url: 'not-a-url' }))).toBe(false);
  });

  it('rejects invalid date', () => {
    expect(isUsable(makeArticle({ publishedAt: 'invalid-date' }))).toBe(false);
  });

  it('accepts valid article', () => {
    expect(isUsable(makeArticle({}))).toBe(true);
  });
});

describe('tokenize', () => {
  it('lowercases and removes diacritics', () => {
    const tokens = tokenize('Élections françaises 2026');
    expect(tokens.has('elections')).toBe(true);
    expect(tokens.has('francaises')).toBe(true);
  });

  it('filters stopwords and short words', () => {
    const tokens = tokenize('Le PSG et la Coupe');
    // 'le', 'et', 'la' filtrés (stopwords). 'psg' filtré car ≤ 2 chars.
    expect(tokens.has('le')).toBe(false);
    expect(tokens.has('et')).toBe(false);
    expect(tokens.has('coupe')).toBe(true);
  });

  it('removes punctuation', () => {
    const tokens = tokenize('AI/ML, vraiment ?');
    expect(tokens.has('vraiment')).toBe(true);
    expect(tokens.has(',')).toBe(false);
  });
});

describe('jaccard', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
  });

  it('returns 0.5 for half overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 2);
  });

  it('returns 1 for two empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });
});

describe('deduplicate', () => {
  it('removes near-duplicate titles (same words, different order)', () => {
    const articles = [
      makeArticle({
        title: 'Tesla annonce nouveau modèle voiture électrique 2026',
        url: 'https://a.com/1',
      }),
      makeArticle({
        title: 'Tesla : nouveau modèle voiture électrique annoncé 2026',
        url: 'https://b.com/2',
      }),
    ];
    const out = deduplicate(articles);
    expect(out).toHaveLength(1);
  });

  it('keeps articles with disjoint titles', () => {
    const articles = [
      makeArticle({ title: 'Bourse française en hausse', url: 'https://a.com/1' }),
      makeArticle({ title: 'Football : PSG remporte Coupe', url: 'https://b.com/2' }),
    ];
    expect(deduplicate(articles)).toHaveLength(2);
  });

  it('preserves order (keeps first occurrence)', () => {
    const articles = [
      makeArticle({ title: 'Tesla annonce nouveau modèle voiture', url: 'https://first.com' }),
      makeArticle({ title: 'Tesla : nouvelle voiture annoncée', url: 'https://dup.com' }),
    ];
    const out = deduplicate(articles);
    expect(out[0].url).toBe('https://first.com');
  });
});

describe('qualityScore', () => {
  it('boosts long description', () => {
    const a = makeArticle({ description: 'a'.repeat(50) });
    const b = makeArticle({ description: 'b'.repeat(300) });
    expect(qualityScore(b)).toBeGreaterThan(qualityScore(a));
  });

  it('boosts trusted source', () => {
    const generic = makeArticle({ sourceName: 'Random Blog' });
    const trusted = makeArticle({ sourceName: 'Le Monde' });
    expect(qualityScore(trusted)).toBeGreaterThan(qualityScore(generic));
  });

  it('boosts recent articles (< 24h)', () => {
    const recent = makeArticle({ publishedAt: new Date().toISOString() });
    const old = makeArticle({
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(qualityScore(recent)).toBeGreaterThan(qualityScore(old));
  });

  it('boosts body presence', () => {
    const noBody = makeArticle({});
    const withBody = makeArticle({ body: 'a'.repeat(1000) });
    expect(qualityScore(withBody)).toBeGreaterThan(qualityScore(noBody));
  });
});

describe('rankByQuality', () => {
  it('ranks high-quality first, preserves stable order on ties', () => {
    const articles = [
      makeArticle({ title: 'A', sourceName: 'Random', description: 'short' }),
      makeArticle({
        title: 'B',
        sourceName: 'Le Monde',
        description: 'a'.repeat(300),
        body: 'b'.repeat(1000),
      }),
      makeArticle({ title: 'C', sourceName: 'Other', description: 'short' }),
    ];
    const ranked = rankByQuality(articles);
    expect(ranked[0].title).toBe('B'); // meilleur score
  });
});
