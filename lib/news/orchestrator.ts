import { NewsProvider, NewsArticle, NewsSearchOptions } from './providers/base';
import { NewsApiProvider } from './providers/newsapi';
import { GNewsProvider } from './providers/gnews';
import { MediastackProvider } from './providers/mediastack';
import { GuardianProvider } from './providers/guardian';

// Sources jugées de qualité (mineur boost dans le scoring)
const TRUSTED_SOURCES = new Set([
  'Le Monde', 'Le Figaro', 'Libération', 'Mediapart', 'Les Echos', 'La Tribune',
  'France 24', 'RFI', 'AFP', 'Reuters', 'Bloomberg', 'Financial Times',
  'BBC News', 'The Guardian', 'The New York Times', 'The Washington Post',
  'Jeune Afrique', 'Africa News', 'Cameroon Tribune', 'Senegal News',
]);

export class NewsOrchestrator {
  private providers: NewsProvider[] = [];

  constructor() {
    this.providers = [
      new NewsApiProvider(),
      new GNewsProvider(),
      new MediastackProvider(),
      new GuardianProvider(),
    ];
  }

  async search(opts: NewsSearchOptions, preferredProvider?: string): Promise<NewsArticle[]> {
    const isAuto = !preferredProvider || preferredProvider === 'AUTO';

    let raw: NewsArticle[] = [];

    if (!isAuto) {
      const provider = this.providers.find(p => p.name.toLowerCase() === preferredProvider!.toLowerCase());
      if (provider) {
        console.log(`[Orchestrator] forced provider: ${provider.name}`);
        raw = await provider.search(opts);
      }
    } else {
      console.log('[Orchestrator] multi-provider parallel search');
      const results = await Promise.all(this.providers.map(p => p.search(opts)));
      // Entrelacement round-robin pour éviter qu'un seul provider domine
      const maxLength = Math.max(0, ...results.map(r => r.length));
      for (let i = 0; i < maxLength; i++) {
        for (const providerResults of results) {
          if (i < providerResults.length) raw.push(providerResults[i]);
        }
      }
    }

    // 1. Filtres durs : article inutilisable → on jette
    const filtered = raw.filter(isUsable);

    // 2. Déduplication par similarité de titre (Jaccard sur tokens)
    const deduped = deduplicate(filtered);

    // 3. Pondération qualité (tri stable par score décroissant)
    return rankByQuality(deduped);
  }
}

// ─── Filtres ──────────────────────────────────────────────────────────────────

function isUsable(a: NewsArticle): boolean {
  if (!a.title || a.title === '[Removed]') return false;
  if (!a.url || !/^https?:\/\//i.test(a.url)) return false;
  if (!a.urlToImage || !/^https?:\/\//i.test(a.urlToImage)) return false;
  if (!a.description || a.description.trim().length < 30) return false;
  // Date parseable
  if (!a.publishedAt || isNaN(new Date(a.publishedAt).getTime())) return false;
  return true;
}

// ─── Déduplication par similarité ────────────────────────────────────────────

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'l',
  'et', 'ou', 'à', 'a', 'en', 'au', 'aux', 'dans', 'sur', 'pour', 'par',
  'qui', 'que', 'quoi', 'dont', 'où', 'ce', 'cet', 'cette', 'ces',
  'son', 'sa', 'ses', 'leur', 'leurs', 'mon', 'ma', 'mes',
  'est', 'sont', 'être', 'avoir', 'a', 'ont', 'fait',
  'avec', 'sans', 'mais', 'donc', 'or', 'ni', 'car',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // diacritics combining marks
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS_FR.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function deduplicate(articles: NewsArticle[], threshold = 0.7): NewsArticle[] {
  const kept: { article: NewsArticle; tokens: Set<string> }[] = [];
  for (const article of articles) {
    const tokens = tokenize(article.title);
    const isDup = kept.some(k => jaccard(tokens, k.tokens) >= threshold);
    if (!isDup) kept.push({ article, tokens });
  }
  return kept.map(k => k.article);
}

// ─── Scoring qualité ─────────────────────────────────────────────────────────

function qualityScore(a: NewsArticle): number {
  let score = 0;
  if (a.description && a.description.length > 200) score += 2;
  if (a.urlToImage?.startsWith('https://')) score += 1;
  if (a.body && a.body.length > 500) score += 2;

  const ageMs = Date.now() - new Date(a.publishedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 24) score += 2;
  else if (ageHours < 72) score += 1;

  if (TRUSTED_SOURCES.has(a.sourceName)) score += 1;

  return score;
}

function rankByQuality(articles: NewsArticle[]): NewsArticle[] {
  // Tri stable : on attache l'index original pour briser les égalités sans réordonner
  const indexed = articles.map((a, i) => ({ a, i, score: qualityScore(a) }));
  indexed.sort((x, y) => y.score - x.score || x.i - y.i);
  return indexed.map(x => x.a);
}

export const newsOrchestrator = new NewsOrchestrator();

// Exports pour les tests unitaires (ne pas utiliser en application)
export const __test__ = {
  isUsable,
  tokenize,
  jaccard,
  deduplicate,
  qualityScore,
  rankByQuality,
};
