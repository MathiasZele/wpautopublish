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
}): { system: string; user: string } {
  const system = `Tu es un rédacteur web expert SEO.
Tu rédiges des articles en ${params.language}, au ton ${params.tone}.
Format de sortie OBLIGATOIRE : HTML propre uniquement.
Structure : <h2> pour les parties, <h3> pour les sous-parties, <ul><li> pour les listes.
Aucun markdown. Uniquement le contenu de l'article, sans balises <html> <body> <head>.
À la fin, retourne un objet JSON sur UNE seule ligne avec ce format exact :
SEO_META:{"title":"...","metadesc":"...","focuskw":"..."}
${params.customPrompt || ''}`.trim();

  const user = params.newsContext
    ? `Rédige un article complet sur ce sujet d'actualité :\n\n${params.newsContext}\n\nSujet : ${params.topic}`
    : `Rédige un article complet et informatif sur : ${params.topic}`;

  return { system, user };
}

export function parseArticleResponse(raw: string): {
  html: string;
  seo: { title: string; metadesc: string; focuskw: string };
} {
  const seoMatch = raw.match(/SEO_META:(\{.*?\})/);
  let seo = { title: '', metadesc: '', focuskw: '' };
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
