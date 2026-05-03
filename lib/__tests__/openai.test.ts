import { describe, it, expect } from 'vitest';
import { parseArticleResponse, calculateCost } from '../openai';

const validHtml = '<p>'.padEnd(250, 'x') + '</p>';

const validJson = {
  html: validHtml,
  seo: {
    title: 'Mon titre',
    metadesc: 'Description',
    focuskw: 'mot clé',
    tags: ['tag1', 'tag2'],
    categoryIds: [1, 2],
  },
  language_check: 'fr',
};

describe('parseArticleResponse', () => {
  describe('happy path', () => {
    it('parses valid JSON correctly', () => {
      const result = parseArticleResponse(JSON.stringify(validJson));
      expect(result.html).toBe(validHtml);
      expect(result.seo.title).toBe('Mon titre');
      expect(result.seo.tags).toEqual(['tag1', 'tag2']);
      expect(result.seo.categoryIds).toEqual([1, 2]);
      expect(result.languageCheck).toBe('fr');
    });

    it('lowercases language_check', () => {
      const result = parseArticleResponse(JSON.stringify({ ...validJson, language_check: 'FR' }));
      expect(result.languageCheck).toBe('fr');
    });

    it('defaults missing optional fields', () => {
      const minimal = {
        html: validHtml,
        seo: { title: 'X' }, // metadesc, focuskw, tags, categoryIds absent
      };
      const result = parseArticleResponse(JSON.stringify(minimal));
      expect(result.seo.metadesc).toBe('');
      expect(result.seo.focuskw).toBe('');
      expect(result.seo.tags).toEqual([]);
      expect(result.seo.categoryIds).toEqual([]);
    });
  });

  describe('rejection cases', () => {
    it('throws on non-JSON', () => {
      expect(() => parseArticleResponse('this is not json')).toThrow(/non-JSON/);
    });

    it('throws on missing html', () => {
      const bad = { seo: { title: 'X' } };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on html < 200 chars', () => {
      const bad = { ...validJson, html: '<p>too short</p>' };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on html > 50000 chars', () => {
      const bad = { ...validJson, html: '<p>' + 'a'.repeat(50_000) + '</p>' };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on missing seo.title', () => {
      const bad = { ...validJson, seo: { ...validJson.seo, title: '' } };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on title > 200 chars', () => {
      const bad = { ...validJson, seo: { ...validJson.seo, title: 'a'.repeat(201) } };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on tags > 10', () => {
      const bad = {
        ...validJson,
        seo: { ...validJson.seo, tags: Array(11).fill('tag') },
      };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on categoryIds > 20', () => {
      const bad = {
        ...validJson,
        seo: { ...validJson.seo, categoryIds: Array.from({ length: 21 }, (_, i) => i) },
      };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws on negative categoryId', () => {
      const bad = { ...validJson, seo: { ...validJson.seo, categoryIds: [-1] } };
      expect(() => parseArticleResponse(JSON.stringify(bad))).toThrow();
    });
  });
});

describe('calculateCost', () => {
  it('computes correct cost for gpt-4o-mini pricing', () => {
    // 1M input tokens = $0.150, 1M output tokens = $0.600
    const cost = calculateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.150 + 0.600, 5);
  });

  it('computes 0 for 0 tokens', () => {
    expect(calculateCost(0, 0)).toBe(0);
  });

  it('computes correct cost for typical article (1k in, 500 out)', () => {
    const cost = calculateCost(1000, 500);
    // 1000 * 0.150/1M + 500 * 0.600/1M = 0.00015 + 0.0003 = 0.00045
    expect(cost).toBeCloseTo(0.00045, 6);
  });
});
