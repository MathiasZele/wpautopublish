import { NewsProvider, NewsArticle, NewsSearchOptions } from './base';

export class NewsApiProvider extends NewsProvider {
  name = 'NewsAPI';

  async search(opts: NewsSearchOptions): Promise<NewsArticle[]> {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return [];

    const params = new URLSearchParams({
      q: opts.query,
      pageSize: String(opts.pageSize ?? 10),
      page: String(opts.page ?? 1),
      sortBy: 'publishedAt',
      language: opts.language ?? 'fr',
    });

    if (opts.maxAgeHours) {
      const fromDate = new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000);
      params.set('from', fromDate.toISOString());
    }

    try {
      const response = await fetch(`https://newsapi.org/v2/everything?${params}`, {
        headers: { 'X-Api-Key': apiKey },
        cache: 'no-store',
      });

      if (!response.ok) return [];

      const data = await response.json();
      const articles = (data.articles ?? []) as any[];

      return articles.map(a => ({
        title: a.title,
        description: a.description ?? '',
        url: a.url,
        urlToImage: a.urlToImage,
        publishedAt: a.publishedAt,
        sourceName: a.source?.name ?? 'NewsAPI',
        providerName: this.name,
      }));
    } catch (error) {
      console.error('NewsApiProvider error:', error);
      return [];
    }
  }
}
