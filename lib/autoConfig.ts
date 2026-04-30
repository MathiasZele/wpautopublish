import { openai } from './openai';
import type { SiteContext } from './wordpress';

export interface AutoConfigResult {
  newsApiQuery: string;
  topics: string[];
  reasoning: string;
}

export async function generateAutoConfig(ctx: SiteContext, language = 'fr'): Promise<AutoConfigResult> {
  const categoriesList = ctx.categories
    .filter((c) => c.count > 0)
    .map((c) => `- ${c.name} (${c.count} articles)`)
    .join('\n') || '(aucune catégorie active)';

  const recentList = ctx.recentTitles.length > 0
    ? ctx.recentTitles.map((t) => `- ${t}`).join('\n')
    : '(aucun article récent)';

  const system = `Tu es un expert SEO et content strategist spécialisé dans la curation d'actualités.
À partir des informations d'un site WordPress, tu génères :
1. Une **requête NewsAPI** optimisée (paramètre \`q\` de https://newsapi.org/v2/everything)
2. Une liste de **15 à 25 thématiques** d'articles prêtes à publier sur ce site

Règles strictes pour la requête NewsAPI :
- Syntaxe : utiliser OR entre synonymes, AND pour combiner concepts, "guillemets" pour expressions exactes, parenthèses pour grouper
- Forme générale recommandée : (motA OR "motB" OR motC) AND (contexteA OR contexteB)
- 5 à 12 mots-clés au total, en évitant les termes ultra-génériques ("nouveau", "info")
- En français si le site est en français

Règles strictes pour les thématiques :
- Sujets COMPLETS d'articles (pas de simples mots-clés)
- 50 à 90 caractères chacune
- Mix : actualités chaudes, analyses, comparatifs, guides
- Cohérentes avec les catégories existantes du site

RÉPONSE OBLIGATOIRE — UN SEUL OBJET JSON, sans markdown, sans texte avant/après :
{"newsApiQuery":"...","topics":["...","..."],"reasoning":"1-2 phrases sur ta logique"}`;

  const user = `Site WordPress à analyser :

Nom : ${ctx.name || '(non défini)'}
Description : ${ctx.description || '(non définie)'}
URL : ${ctx.url}
Langue cible : ${language}

Catégories actives (par fréquence) :
${categoriesList}

Derniers articles publiés :
${recentList}

Génère la configuration optimale.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? '{}';
  let parsed: AutoConfigResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse IA invalide');
  }

  if (
    typeof parsed.newsApiQuery !== 'string' ||
    !Array.isArray(parsed.topics) ||
    parsed.topics.length === 0
  ) {
    throw new Error('Format de réponse IA inattendu');
  }

  return {
    newsApiQuery: parsed.newsApiQuery.trim(),
    topics: parsed.topics
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
      .slice(0, 25),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}
