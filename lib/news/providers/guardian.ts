import { NewsProvider, NewsArticle, NewsSearchOptions, safeFetch } from './base';

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
      // bodyText : champ dispo gratuitement, donne le contenu complet (1500+ chars)
      'show-fields': 'thumbnail,trailText,bodyText',
    });

    if (opts.maxAgeHours) {
      const fromDate = new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000);
      params.set('from-date', fromDate.toISOString().split('T')[0]); // YYYY-MM-DD
    }

    const response = await safeFetch(`https://content.guardianapis.com/search?${params}`, {
      cache: 'no-store',
    });
    if (!response || !response.ok) return [];

    try {
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
        body: typeof r.fields?.bodyText === 'string' ? r.fields.bodyText : undefined,
      }));
    } catch (error) {
      console.error('GuardianProvider parse error:', error);
      return [];
    }
  }
}
