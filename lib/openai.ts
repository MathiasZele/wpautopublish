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
  manualInput?: string;
  formatOnly?: boolean;
}): { system: string; user: string } {
  const categoryInstruction = params.availableCategories?.length
    ? `\nChoisis 1 à 3 IDs de catégories parmi cette liste :\n${params.availableCategories.map(c => `- ID: ${c.id}, Nom: ${c.name}`).join('\n')}`
    : '';

  const themeInstruction = params.websiteTheme
    ? `\nTHÉMATIQUE STRICTE : L'article (ton, vocabulaire, angle) DOIT impérativement respecter cette thématique : ${params.websiteTheme}. Ne dévie pas du sujet principal du site.`
    : '';

  const websiteTheme = params.websiteTheme || 'General News';
  const categoryNames = params.availableCategories?.map(c => c.name).join(', ') || 'General';

  if (!params.manualInput) {
    const system = `Tu es un rédacteur web expert SEO.
Tu rédiges des articles au ton ${params.tone}.
TRADUCTION STRICTE OBLIGATOIRE : L'intégralité du contenu, Y COMPRIS LE TITRE (title), le meta desc, les tags et le texte de l'article DOIT impérativement être rédigé en ${params.language}. Si la source est dans une autre langue, traduis toutes les informations.
Format de sortie OBLIGATOIRE : HTML propre uniquement.
Structure : <h2> pour les parties, <h3> pour les sous-parties, <ul><li> pour les listes.
Aucun markdown. Uniquement le contenu de l'article, sans balises <html> <body> <head>.
IMPORTANT : Ne JAMAIS inclure de labels comme "Titre :", "Chapô :", "Introduction :", "Conclusion :" ou "Résumé :" dans le corps HTML de l'article. Passe directement au contenu.
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
  } else if (params.formatOnly) {
    const system = `You are an expert web integrator and SEO specialist for "${websiteTheme}".
Your task is STRICTLY to take the user's raw text and format it into clean HTML (<h2>, <p>, <ul>, <strong>) without rewriting, summarizing, or changing the words of the original text. You must preserve the original text exactly, only adding HTML tags for structure and readability.
Do NOT translate the text unless requested.
You must also generate appropriate SEO metadata based on the text.
Format your response as a valid JSON object:
{
  "seo": { "title": "...", "metadesc": "...", "focuskw": "...", "tags": ["...", "..."], "category": "..." },
  "html": "...",
  "suggested_image_prompt": "..."
}`;
    const user = `Format the following text into valid HTML without changing its content, and generate SEO metadata:

---
${params.manualInput}
---

Include:
1. SEO Title (optimized)
2. Meta-description
3. Focus Keyword
4. Content in valid HTML.
5. 5-10 tags.
6. A category recommendation from: ${categoryNames}.

Return ONLY JSON.`;
    return { system, user };
  } else {
    const system = `You are an expert journalist and SEO specialist for "${websiteTheme}".
Your task is to interpret the user's raw input and reformulate it into a professional, high-quality news article.

IMPORTANT:
- If the user provides a specific title (e.g., "Title: My Article"), use it as the base for the SEO title.
- If the user provides specific keywords or categories, respect them.
- Format the article with professional HTML (<h2>, <p>).
- Always translate the final content into ${params.language}.
- Ensure the tone is ${params.tone}.
- Adhere to the website theme: ${websiteTheme}.
- IMPORTANT: DO NOT include labels like "Title:", "Chapô:", or "Conclusion:" inside the "html" content. The "html" should only contain the actual narrative.

Format your response as a valid JSON object:
{
  "seo": { "title": "...", "metadesc": "...", "focuskw": "...", "tags": ["...", "..."], "category": "..." },
  "html": "...",
  "suggested_image_prompt": "..."
}`;
    const user = `Interpret and reformulate the following input into a complete, professional article:

---
${params.manualInput}
---

Include:
1. SEO Title (optimized)
2. Meta-description
3. Focus Keyword
4. Content in valid HTML.
5. 5-10 tags.
6. A category recommendation from: ${categoryNames}.

Return ONLY JSON.`;
    return { system, user };
  }
}

export function parseArticleResponse(raw: string): {
  html: string;
  seo: { title: string; metadesc: string; focuskw: string; categoryIds?: number[]; tags?: string[] };
} {
  // 1. Try to see if the whole thing is JSON (manual mode)
  if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
    try {
      const data = JSON.parse(raw);
      if (data.seo && data.html) {
        return {
          html: data.html,
          seo: {
            title: data.seo.title || '',
            metadesc: data.seo.metadesc || '',
            focuskw: data.seo.focuskw || '',
            tags: data.seo.tags || [],
            categoryIds: data.seo.categoryIds || []
          }
        };
      }
    } catch {
      // Not JSON, continue to SEO_META
    }
  }

  // 2. Standard mode with SEO_META marker
  const seoMatch = raw.match(/SEO_META:(\{.*?\})/);
  let seo: any = { title: '', metadesc: '', focuskw: '', categoryIds: [], tags: [] };
  if (seoMatch) {
    try {
      seo = JSON.parse(seoMatch[1]);
    } catch {
      // ignore parse errors
    }
  }
  const html = raw.replace(/SEO_META:\{.*?\}/, '').trim();
  return { html, seo };
}
