export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  sourceName: string;
  providerName: string;
}

export interface NewsSearchOptions {
  query: string;
  pageSize?: number;
  page?: number;
  language?: string;
  maxAgeHours?: number;
}

export abstract class NewsProvider {
  abstract name: string;
  abstract search(opts: NewsSearchOptions): Promise<NewsArticle[]>;

  protected filterArticles(articles: NewsArticle[], maxAgeHours?: number): NewsArticle[] {
    if (!maxAgeHours || maxAgeHours <= 0) return articles;
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    return articles.filter(a => new Date(a.publishedAt) >= cutoff);
  }
}
