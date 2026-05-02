export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  sourceName: string;
  providerName: string;
  body?: string; // Contenu enrichi quand disponible (Guardian, etc.)
}

export interface NewsSearchOptions {
  query: string;
  pageSize?: number;
  page?: number;
  language?: string;
  maxAgeHours?: number;
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8000;

/**
 * fetch avec timeout dur (AbortController). Renvoie null si timeout/erreur.
 * Utilisé par tous les providers pour qu'un provider lent ne fige pas l'orchestrateur.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response | null> {
  const { timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      console.warn(`[provider] timeout ${timeoutMs}ms on ${new URL(url).hostname}`);
    } else {
      console.warn(`[provider] fetch failed on ${new URL(url).hostname}: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

export abstract class NewsProvider {
  abstract name: string;
  abstract search(opts: NewsSearchOptions): Promise<NewsArticle[]>;

  protected filterArticles(articles: NewsArticle[], maxAgeHours?: number): NewsArticle[] {
    if (!maxAgeHours || maxAgeHours <= 0) return articles;
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    return articles.filter(a => {
      const d = new Date(a.publishedAt);
      return !isNaN(d.getTime()) && d >= cutoff;
    });
  }
}
