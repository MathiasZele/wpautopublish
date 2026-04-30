import { NewsProvider, NewsArticle, NewsSearchOptions } from './providers/base';
import { NewsApiProvider } from './providers/newsapi';
import { GNewsProvider } from './providers/gnews';
import { MediastackProvider } from './providers/mediastack';
import { GuardianProvider } from './providers/guardian';

export class NewsOrchestrator {
  private providers: NewsProvider[] = [];

  constructor() {
    this.providers = [
      new NewsApiProvider(),
      new GNewsProvider(),
      new MediastackProvider(),
      new GuardianProvider(),
    ];
  }

  async search(opts: NewsSearchOptions, preferredProvider?: string): Promise<NewsArticle[]> {
    // 1. Manuel Override
    if (preferredProvider && preferredProvider !== 'AUTO') {
      const provider = this.providers.find(p => p.name.toLowerCase() === preferredProvider.toLowerCase());
      if (provider) {
        console.log(`[Orchestrator] Using forced provider: ${provider.name}`);
        return provider.search(opts);
      }
    }

    // 2. Stratégie de Spécialisation (Idée 2)
    // Exemple: Si la requête contient 'finance' ou 'économie', on pourrait prioriser Mediastack
    // Pour l'instant, on va faire un fetch parallèle et dédoublonner

    console.log('[Orchestrator] Running multi-provider search (Auto mode)');
    
    // On lance les recherches en parallèle sur les APIs configurées
    const results = await Promise.all(this.providers.map(p => p.search(opts)));
    
    // Entrelacer les résultats (Interleaving) pour garantir une bonne rotation
    // ex: [API1_1, API2_1, API3_1, API1_2, API2_2...]
    const allArticles: NewsArticle[] = [];
    const maxLength = Math.max(...results.map(r => r.length), 0);
    for (let i = 0; i < maxLength; i++) {
      for (const providerResults of results) {
        if (i < providerResults.length) {
          allArticles.push(providerResults[i]);
        }
      }
    }

    // 3. Dédoublonnage (Idée 3)
    return this.deduplicate(allArticles);
  }

  private deduplicate(articles: NewsArticle[]): NewsArticle[] {
    const seenTitles = new Set<string>();
    const uniqueArticles: NewsArticle[] = [];

    for (const article of articles) {
      const normalizedTitle = this.normalizeTitle(article.title);
      
      // On vérifie si un titre similaire existe déjà
      let isDuplicate = false;
      for (const seen of seenTitles) {
        if (this.isSimilar(normalizedTitle, seen)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seenTitles.add(normalizedTitle);
        uniqueArticles.push(article);
      }
    }

    return uniqueArticles;
  }

  private normalizeTitle(title: string): string {
    return title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private isSimilar(t1: string, t2: string): boolean {
    // Simple vérification de proximité (on peut améliorer avec Levenshtein)
    if (t1 === t2) return true;
    if (t1.includes(t2) || t2.includes(t1)) return true;
    return false;
  }
}

export const newsOrchestrator = new NewsOrchestrator();
