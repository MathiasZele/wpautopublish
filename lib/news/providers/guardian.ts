import { NewsProvider, NewsArticle, NewsSearchOptions } from './base';

export class GuardianProvider extends NewsProvider {
  name = 'The Guardian';

  async search(opts: NewsSearchOptions): Promise<NewsArticle[]> {
    const apiKey = process.env.GUARDIAN_API_KEY;
    if (!apiKey) return [];

    const params = new URLSearchParams({
      q: opts.query,
      'page-size': String(opts.pageSize ?? 10),
      page: String(opts.page ?? 1),
      'api-key': apiKey,
      'show-fields': 'thumbnail,trailText',
    });

    if (opts.maxAgeHours) {
        const fromDate = new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000);
        params.set('from-date', fromDate.toISOString().split('T')[0]); // Guardian prefers YYYY-MM-DD
    }

    try {
      const response = await fetch(`https://content.guardianapis.com/search?${params}`, {
        cache: 'no-store',
      });

      if (!response.ok) return [];

      const data = await response.json();
      const results = (data.response?.results ?? []) as any[];

      return results.map(r => ({
        title: r.webTitle,
        description: r.fields?.trailText ?? '',
        url: r.webUrl,
        urlToImage: r.fields?.thumbnail ?? null,
        publishedAt: r.webPublicationDate,
        sourceName: 'The Guardian',
        providerName: this.name,
      }));
    } catch (error) {
      console.error('GuardianProvider error:', error);
      return [];
    }
  }
}
