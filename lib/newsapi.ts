export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: { name: string };
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

export interface NewsSearchOpts {
  query: string;
  pageSize?: number;
  maxAgeHours?: number;
  language?: string;
}

export async function searchNews(opts: NewsSearchOpts): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error('NEWS_API_KEY is not configured');

  const params = new URLSearchParams({
    q: opts.query,
    pageSize: String(opts.pageSize ?? 10),
    sortBy: 'publishedAt',
    language: opts.language ?? 'fr',
  });

  if (opts.maxAgeHours && opts.maxAgeHours > 0) {
    const fromDate = new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000);
    params.set('from', fromDate.toISOString());
  }

  const response = await fetch(`https://newsapi.org/v2/everything?${params}`, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`NewsAPI ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as NewsApiResponse;
  return data.articles ?? [];
}

/**
 * @deprecated use searchNews instead
 */
export const getNewsForQuery = (query: string, pageSize = 5) =>
  searchNews({ query, pageSize });
