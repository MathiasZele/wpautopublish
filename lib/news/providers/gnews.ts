import { NewsProvider, NewsArticle, NewsSearchOptions } from './base';

export class GNewsProvider extends NewsProvider {
  name = 'GNews';

  async search(opts: NewsSearchOptions): Promise<NewsArticle[]> {
    const apiKey = process.env.GNEWS_API_KEY;
    if (!apiKey) return [];

    const params = new URLSearchParams({
      q: opts.query,
      max: String(opts.pageSize ?? 10),
      lang: opts.language ?? 'fr',
      apikey: apiKey,
    });

    // GNews supporte aussi 'from'
    if (opts.maxAgeHours) {
      const fromDate = new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000);
      params.set('from', fromDate.toISOString());
    }

    try {
      const response = await fetch(`https://gnews.io/api/v4/search?${params}`, {
        cache: 'no-store',
      });

      if (!response.ok) return [];

      const data = await response.json();
      const articles = (data.articles ?? []) as any[];

      return articles.map(a => ({
        title: a.title,
        description: a.description ?? '',
        url: a.url,
        urlToImage: a.image,
        publishedAt: a.publishedAt,
        sourceName: a.source?.name ?? 'GNews',
        providerName: this.name,
      }));
    } catch (error) {
      console.error('GNewsProvider error:', error);
      return [];
    }
  }
}
