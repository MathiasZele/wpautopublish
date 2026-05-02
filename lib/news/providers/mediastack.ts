import { NewsProvider, NewsArticle, NewsSearchOptions, safeFetch } from './base';

export class MediastackProvider extends NewsProvider {
  name = 'Mediastack';

  async search(opts: NewsSearchOptions): Promise<NewsArticle[]> {
    const apiKey = process.env.MEDIASTACK_API_KEY;
    if (!apiKey) return [];

    const pageSize = opts.pageSize ?? 10;
    const offset = ((opts.page ?? 1) - 1) * pageSize;

    const params = new URLSearchParams({
      access_key: apiKey,
      keywords: opts.query,
      limit: String(pageSize),
      offset: String(offset),
      languages: opts.language ?? 'fr',
      sort: 'published_desc',
    });

    // Mediastack : on tente HTTPS d'abord (compte payant). Si échec → fallback HTTP avec warning.
    let response = await safeFetch(`https://api.mediastack.com/v1/news?${params}`, {
      cache: 'no-store',
    });
    if (!response || !response.ok) {
      const status = response?.status ?? 'no-response';
      console.warn(`[mediastack] HTTPS échoué (${status}), fallback HTTP — risque sécurité, considérer un upgrade payant`);
      response = await safeFetch(`http://api.mediastack.com/v1/news?${params}`, {
        cache: 'no-store',
      });
      if (!response || !response.ok) return [];
    }

    try {
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
      console.error('MediastackProvider parse error:', error);
      return [];
    }
  }
}
