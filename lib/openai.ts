import OpenAI from 'openai';
import { z } from 'zod';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PRICING = {
  input: 0.150 / 1_000_000,
  output: 0.600 / 1_000_000,
};

export function calculateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * PRICING.input + outputTokens * PRICING.output;
}

export type PromptMode = 'standard' | 'manual' | 'format-only';

export interface BuildPromptParams {
  topic: string;
  tone: string;
  language: string;
  customPrompt?: string;
  newsContext?: string;
  availableCategories?: { id: number; name: string }[];
  websiteTheme?: string;
  manualInput?: string;
  mode?: PromptMode;
}

export interface ParsedArticle {
  html: string;
  seo: {
    title: string;
    metadesc: string;
    focuskw: string;
    tags: string[];
    categoryIds: number[];
  };
  languageCheck?: string;
}

/**
 * Construit un prompt unique pour les 3 modes : standard, manual, format-only.
 * Format de sortie obligatoire : un seul objet JSON (forcé via response_format).
 * Toujours en français pour les instructions, toujours le même schéma.
 */
export function buildArticlePrompt(params: BuildPromptParams): { system: string; user: string; mode: PromptMode } {
  const mode: PromptMode = params.mode ?? (params.manualInput ? 'manual' : 'standard');

  const websiteTheme = params.websiteTheme || 'site d\'actualité généraliste';
  const categoriesList = params.availableCategories?.length
    ? params.availableCategories.map(c => `  - id=${c.id} : ${c.name}`).join('\n')
    : '';

  // ─── Bloc commun à tous les modes ──────────────────────────────────────────
  const commonRules = `
LANGUE CIBLE : ${params.language}
Toute la sortie (titre, description SEO, tags, contenu HTML) doit être rédigée intégralement en ${params.language}.
Si la source est dans une autre langue, traduis-la.
Renvoie obligatoirement le champ "language_check" avec le code de langue dans lequel tu as effectivement écrit (ex: "fr", "en").

FORMAT HTML AUTORISÉ (uniquement) :
  <p>, <h2>, <h3>, <h4>, <ul>, <ol>, <li>, <strong>, <em>, <a href="...">, <blockquote>, <code>
Aucun markdown (jamais de #, ##, **, [..](..)) — uniquement HTML.
Pas de balises <html>, <head>, <body>, <script>, <style>, <iframe>.

INTERDITS DANS LE CORPS DE L'ARTICLE :
  Les labels "Titre :", "Introduction :", "Chapô :", "Conclusion :", "Résumé :", "Mots-clés :".
  Les listes en wrapper redondant (du type "Voici les points :"). Aller direct au contenu.

STRUCTURE OBLIGATOIRE :
  1. Introduction : 1 paragraphe <p> de 100-150 mots. Pose le contexte, l'enjeu, sans répéter le titre.
  2. Corps : 4 à 6 sections, chacune avec un <h2>. Sous chaque <h2>, 2 à 3 paragraphes <p>.
     Chaque section doit faire AU MINIMUM 180 mots, idéalement 220.
     Tu peux ajouter <h3> ou <ul> pour structurer une section longue.
  3. Conclusion : 1 paragraphe <p> de 100-150 mots, SANS balise <h2>. Ne mets JAMAIS un <h2>Conclusion</h2>.
     Démarre la conclusion directement par le contenu (ex: "En définitive, ...").

LONGUEUR CIBLE STRICTE : 900 à 1100 mots de contenu réel (texte hors balises).
  - Un article < 800 mots est REJETÉ — il manque de profondeur.
  - Compte mentalement : intro (120) + 5 sections × 200 mots (1000) + conclusion (120) ≈ 1240 mots.
  - Étoffe chaque section avec : contexte historique, conséquences, parties prenantes, citations indirectes, comparaisons, perspectives. Va au-delà du résumé du contexte source.
  - Ne fais PAS de listes à puces sèches qui réduisent le compte de mots — préfère les paragraphes développés.

CONTRAINTES FACTUELLES (anti-hallucination) :
  - N'invente jamais de chiffres, dates, citations, noms de personnes ou d'entreprises qui ne sont pas présents dans le contexte source fourni.
  - Si une information clé est absente, formule en termes généraux ("plusieurs analystes", "récemment") plutôt que d'inventer.
  - OBLIGATOIRE : tu DOIS mentionner explicitement le nom de la source originale (champ "Source :" du contexte fourni) au moins UNE fois dans le corps, via une formulation naturelle.
    Exemples acceptés : « selon Jeune Afrique », « rapporte Reuters », « comme l'indique Le Monde », « d'après les informations de la BBC ».
    Cette mention NE DOIT PAS être en conclusion uniquement — idéalement dans un paragraphe central.
  - Ne fabrique pas d'URLs ni de citations textuelles.

TON ÉDITORIAL : ${params.tone}.
THÉMATIQUE DU SITE : ${websiteTheme}. Reste dans cet univers.
`.trim();

  const seoBlock = `
SEO :
  - title : 50-60 caractères, accrocheur, contient le mot-clé principal
  - metadesc : 130-155 caractères, résume l'angle, donne envie de cliquer
  - focuskw : 1 à 3 mots-clés (le sujet central)
  - tags : 3 à 6 mots-clés courts, en ${params.language}
${categoriesList ? `  - categoryIds : choisis 1 à 3 IDs parmi cette liste :\n${categoriesList}` : '  - categoryIds : laisser vide []'}
`.trim();

  const responseFormat = `
Réponds OBLIGATOIREMENT par un objet JSON unique, sans texte avant/après, avec ce schéma exact :
{
  "html": "<p>...</p><h2>...</h2><p>...</p>",
  "seo": {
    "title": "...",
    "metadesc": "...",
    "focuskw": "...",
    "tags": ["...", "..."],
    "categoryIds": [1, 2]
  },
  "language_check": "${params.language}"
}
`.trim();

  // ─── System par mode ───────────────────────────────────────────────────────
  let systemHeader: string;
  let user: string;

  switch (mode) {
    case 'format-only':
      systemHeader = `Tu es un intégrateur web SEO pour "${websiteTheme}".
Ta tâche EST STRICTEMENT de prendre le texte brut fourni et de le mettre en forme en HTML propre, sans réécrire, résumer ou modifier les mots originaux.
Tu peux uniquement ajouter de la structure HTML (titres <h2>, paragraphes <p>, listes, gras) pour la lisibilité.
Tu ne traduis PAS sauf si la langue cible diffère.
Tu génères les métadonnées SEO sur la base du texte fourni.`;
      user = `Texte brut à mettre en forme (sans le réécrire) :

---
${params.manualInput}
---

Génère la sortie JSON.`;
      break;

    case 'manual':
      systemHeader = `Tu es un journaliste rédacteur expert SEO pour "${websiteTheme}".
Tu reçois un brief utilisateur (sujet, axe, ou note) et tu rédiges un article professionnel et original autour.
Tu reformules entièrement, tu n'es pas tenu de garder les mots du brief tels quels.`;
      user = `Brief utilisateur :

---
${params.manualInput}
---

Sujet/angle : ${params.topic}
${params.newsContext ? `\nContexte source (à utiliser comme matière, pas à recopier) :\n${params.newsContext}` : ''}

Rédige l'article complet et renvoie la sortie JSON.`;
      break;

    case 'standard':
    default:
      systemHeader = `Tu es un journaliste rédacteur expert SEO pour "${websiteTheme}".
Tu rédiges un article complet à partir d'un sujet d'actualité réel.
Tu utilises le contexte source comme matière première mais tu rédiges à ta propre voix — ne recopie pas les phrases de la source.`;
      user = `Sujet d'actualité : ${params.topic}
${params.newsContext ? `\nContexte source (matière, pas à plagier) :\n${params.newsContext}` : ''}

Rédige l'article complet et renvoie la sortie JSON.`;
      break;
  }

  const customSuffix = params.customPrompt ? `\n\nCONSIGNES SUPPLÉMENTAIRES DU SITE :\n${params.customPrompt}` : '';

  const system = `${systemHeader}

${commonRules}

${seoBlock}

${responseFormat}${customSuffix}`.trim();

  return { system, user, mode };
}

/**
 * Schéma Zod strict pour la sortie OpenAI.
 * - HTML : entre 200 et 50 000 chars (anti payload géant)
 * - title : 1-200 chars (rejet si vide)
 * - metadesc / focuskw : bornés
 * - tags : max 10 strings de max 60 chars chacun
 * - categoryIds : max 20 entiers positifs (le worker tronquera ensuite à 3)
 * - language_check : optionnel, 2-8 chars (lowercased dans transform)
 */
const ParsedArticleSchema = z.object({
  html: z.string().min(200).max(50_000),
  seo: z.object({
    title: z.string().trim().min(1).max(200),
    metadesc: z.string().trim().max(500).default(''),
    focuskw: z.string().trim().max(100).default(''),
    tags: z.array(z.string().max(60)).max(10).default([]),
    categoryIds: z.array(z.number().int().nonnegative()).max(20).default([]),
  }),
  language_check: z.string().min(2).max(8).optional().transform((v) => v?.toLowerCase()),
});

/**
 * Parse strict de la réponse OpenAI.
 * Suppose response_format: { type: 'json_object' } côté appelant.
 * Throw explicite si le JSON est invalide ou si le schéma n'est pas respecté.
 */
export function parseArticleResponse(raw: string): ParsedArticle {
  const trimmed = raw.trim();

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Réponse IA non-JSON : ${(e as Error).message}. Début : ${trimmed.slice(0, 120)}`);
  }

  const result = ParsedArticleSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Réponse IA invalide : ${issues}`);
  }

  const parsed = result.data;
  return {
    html: parsed.html,
    seo: {
      title: parsed.seo.title,
      metadesc: parsed.seo.metadesc,
      focuskw: parsed.seo.focuskw,
      tags: parsed.seo.tags,
      categoryIds: parsed.seo.categoryIds,
    },
    languageCheck: parsed.language_check,
  };
}
