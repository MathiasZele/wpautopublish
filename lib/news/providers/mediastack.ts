import { NewsProvider, NewsArticle, NewsSearchOptions } from './base';

export class MediastackProvider extends NewsProvider {
  name = 'Mediastack';

  async search(opts: NewsSearchOptions): Promise<NewsArticle[]> {
    const apiKey = process.env.MEDIASTACK_API_KEY;
    if (!apiKey) return [];

    const params = new URLSearchParams({
      access_key: apiKey,
      keywords: opts.query,
      limit: String(opts.pageSize ?? 10),
      languages: opts.language ?? 'fr',
      sort: 'published_desc',
    });

    try {
      // Note: Mediastack Free doesn't support HTTPS. Checking if user has a paid plan or use HTTP.
      // Usually developers start with HTTP for free plan.
      const response = await fetch(`http://api.mediastack.com/v1/news?${params}`, {
        cache: 'no-store',
      });

      if (!response.ok) return [];

      const data = await response.json();
      const articles = (data.data ?? []) as any[];

      return articles.map(a => ({
        title: a.title,
        description: a.description ?? '',
        url: a.url,
        urlToImage: a.image,
        publishedAt: a.published_at,
        sourceName: a.source ?? 'Mediastack',
        providerName: this.name,
      }));
    } catch (error) {
      console.error('MediastackProvider error:', error);
      return [];
    }
  }
}
