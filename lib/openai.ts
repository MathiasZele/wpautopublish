import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PRICING = {
  input: 0.150 / 1_000_000,
  output: 0.600 / 1_000_000,
};

export function calculateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * PRICING.input + outputTokens * PRICING.output;
}

export function buildArticlePrompt(params: {
  topic: string;
  tone: string;
  language: string;
  customPrompt?: string;
  newsContext?: string;
  availableCategories?: { id: number; name: string }[];
  websiteTheme?: string;
}): { system: string; user: string } {
  const categoryInstruction = params.availableCategories?.length
    ? `\nChoisis 1 à 3 IDs de catégories parmi cette liste :\n${params.availableCategories.map(c => `- ID: ${c.id}, Nom: ${c.name}`).join('\n')}`
    : '';

  const themeInstruction = params.websiteTheme
    ? `\nTHÉMATIQUE STRICTE : L'article (ton, vocabulaire, angle) DOIT impérativement respecter cette thématique : ${params.websiteTheme}. Ne dévie pas du sujet principal du site.`
    : '';

  const system = `Tu es un rédacteur web expert SEO.
Tu rédiges des articles au ton ${params.tone}.
TRADUCTION STRICTE OBLIGATOIRE : L'intégralité du contenu, Y COMPRIS LE TITRE (title), le meta desc, les tags et le texte de l'article DOIT impérativement être rédigé en ${params.language}. Si la source est dans une autre langue, traduis toutes les informations.
Format de sortie OBLIGATOIRE : HTML propre uniquement.
Structure : <h2> pour les parties, <h3> pour les sous-parties, <ul><li> pour les listes.
Aucun markdown. Uniquement le contenu de l'article, sans balises <html> <body> <head>.
${themeInstruction}
${categoryInstruction}
Génère aussi 3 à 5 tags (étiquettes) pertinents pour l'article en ${params.language}.
À la fin, retourne un objet JSON sur UNE seule ligne avec ce format exact :
SEO_META:{"title":"...","metadesc":"...","focuskw":"...","categoryIds":[...],"tags":["..."]}
${params.customPrompt || ''}`.trim();

  const user = params.newsContext
    ? `Rédige un article complet sur ce sujet d'actualité :\n\n${params.newsContext}\n\nSujet : ${params.topic}`
    : `Rédige un article complet et informatif sur : ${params.topic}`;

  return { system, user };
}

export function parseArticleResponse(raw: string): {
  html: string;
  seo: { title: string; metadesc: string; focuskw: string; categoryIds?: number[]; tags?: string[] };
} {
  const seoMatch = raw.match(/SEO_META:(\{.*?\})/);
  let seo: any = { title: '', metadesc: '', focuskw: '', categoryIds: [], tags: [] };
  if (seoMatch) {
    try {
      seo = JSON.parse(seoMatch[1]);
    } catch {
      // ignore parse errors, return empty seo
    }
  }
  const html = raw.replace(/SEO_META:\{.*?\}/, '').trim();
  return { html, seo };
}
