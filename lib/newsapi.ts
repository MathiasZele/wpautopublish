interface NewsArticle {
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

export async function getNewsForQuery(query: string, pageSize = 5): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error('NEWS_API_KEY is not configured');

  const params = new URLSearchParams({
    q: query,
    pageSize: String(pageSize),
    sortBy: 'publishedAt',
    language: 'fr',
  });

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
