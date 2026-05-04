import { Website } from '@prisma/client';
import { decrypt } from './encryption';
import { assertPublicUrl } from './safeUrl';
import { getOrSet } from './cache';

/**
 * Headers browser-like envoyés à TOUTES les requêtes vers WordPress.
 *
 * Pourquoi : certains sites WP sont derrière Cloudflare avec "Bot Fight Mode"
 * activé, qui bloque les User-Agent non-browsers (cf. "Just a moment..." 403).
 * Un UA Chrome récent + Accept réaliste suffit dans la plupart des cas.
 *
 * Pour les sites en "Under Attack Mode", la solution est de créer une
 * WAF custom rule "Skip" sur les requêtes ayant le header
 * `X-WP-Autopublish-Token` qui matche `WP_CLOUDFLARE_BYPASS_TOKEN`.
 * Le token est ajouté ici si la variable d'env est définie.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

function wpHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...BROWSER_HEADERS, ...extra };
  const bypass = process.env.WP_CLOUDFLARE_BYPASS_TOKEN;
  if (bypass) {
    headers['X-WP-Autopublish-Token'] = bypass;
  }
  return headers;
}

/**
 * Détecte si une réponse 403 vient de Cloudflare Bot Protection plutôt que de WP.
 * Le body contient typiquement "Just a moment..." ou "challenges.cloudflare.com".
 */
function isCloudflareChallenge(bodySnippet: string): boolean {
  const lower = bodySnippet.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('challenges.cloudflare.com') ||
    lower.includes('cf-chl-')
  );
}

interface PublishParams {
  website: { url: string; customEndpointKey: string };
  title: string;
  content: string;
  yoast_title: string;
  yoast_metadesc: string;
  yoast_focuskw: string;
  featured_image_url?: string;
  status: 'publish' | 'draft';
  categories?: number[];
  tags?: string[];
  excerpt?: string;
}

export async function publishToWordPress(params: PublishParams) {
  const baseUrl = params.website.url.replace(/\/$/, '');
  const endpoint = `${baseUrl}/wp-json/wp-autopublish/v1/publish`;

  await assertPublicUrl(endpoint);

  const decryptedSecret = decrypt(params.website.customEndpointKey);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: wpHeaders({
      'Content-Type': 'application/json',
      'X-WP-AutoPublish-Secret': decryptedSecret,
    }),
    body: JSON.stringify({
      title: params.title,
      content: params.content,
      status: params.status,
      yoast_title: params.yoast_title,
      yoast_metadesc: params.yoast_metadesc,
      yoast_focuskw: params.yoast_focuskw,
      featured_image_url: params.featured_image_url,
      categories: params.categories ?? [],
      tags: params.tags ?? [],
      excerpt: params.excerpt ?? '',
    }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const bodySnippet = await response.text().catch(() => '');
    console.error(
      `[publishToWordPress] ${response.status} ${response.statusText} | body: ${bodySnippet.slice(0, 300)}`,
    );
    if (response.status === 403 && isCloudflareChallenge(bodySnippet)) {
      throw new Error(
        'Bloqué par Cloudflare Bot Protection. Configurez une WAF custom rule "Skip" pour le header X-WP-Autopublish-Token (voir doc).',
      );
    }
    throw new Error(`WordPress publish failed (HTTP ${response.status})`);
  }

  return response.json() as Promise<{ success: boolean; post_id: number; url: string }>;
}

export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/users/me`;
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: wpHeaders({
        Authorization: `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`,
      }),
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!response.ok) {
      if (response.status === 403) {
        const bodySnippet = await response.text().catch(() => '');
        if (isCloudflareChallenge(bodySnippet)) {
          return {
            success: false,
            error:
              'Bloqué par Cloudflare Bot Protection. Voir doc pour configurer une WAF custom rule.',
          };
        }
        return {
          success: false,
          error:
            "Accès refusé (403) — vérifiez que l'API REST WordPress est activée et que les mots de passe d'application sont autorisés",
        };
      }
      if (response.status === 401) {
        return {
          success: false,
          error:
            "Identifiants incorrects (401) — vérifiez le nom d'utilisateur et le mot de passe d'application",
        };
      }
      return { success: false, error: `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Connexion impossible' };
  }
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface SiteContext {
  name: string;
  description: string;
  url: string;
  language?: string;
  categories: { name: string; count: number }[];
  recentTitles: string[];
}

export async function fetchSiteContext(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<SiteContext> {
  const baseUrl = siteUrl.replace(/\/$/, '');
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const headers = wpHeaders({ Authorization: auth });

  await assertPublicUrl(baseUrl + '/wp-json/');

  const [rootRes, catsRes, postsRes] = await Promise.all([
    fetch(`${baseUrl}/wp-json/`, { headers, cache: 'no-store', redirect: 'manual' }),
    fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=50&orderby=count&order=desc`, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    }),
    fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=10&_fields=title&orderby=date&order=desc`, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    }),
  ]);

  if (!rootRes.ok) throw new Error(`WP root ${rootRes.status}`);

  const root = (await rootRes.json()) as {
    name?: string;
    description?: string;
    url?: string;
    home?: string;
    timezone_string?: string;
  };

  let categories: { name: string; count: number }[] = [];
  if (catsRes.ok) {
    const list = (await catsRes.json()) as { name: string; count: number }[];
    categories = list.map((c) => ({ name: c.name, count: c.count })).slice(0, 30);
  }

  let recentTitles: string[] = [];
  if (postsRes.ok) {
    const posts = (await postsRes.json()) as { title?: { rendered?: string } }[];
    recentTitles = posts
      .map((p) => stripHtml(p.title?.rendered ?? ''))
      .filter(Boolean);
  }

  return {
    name: root.name ?? '',
    description: root.description ?? '',
    url: root.home ?? root.url ?? baseUrl,
    categories,
    recentTitles,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '-')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export const WP_CATEGORIES_CACHE_TTL_SECONDS = 300; // 5 min

export async function fetchWordPressCategories(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<WPCategory[]> {
  const baseUrl = siteUrl.replace(/\/$/, '');
  // Clé de cache basée sur (siteUrl, username) — pas sur le password (secret).
  // Si un site change d'URL ou d'utilisateur, la clé change et le cache expire seul.
  const cacheKey = `wp-cats:${baseUrl}:${username}`;

  return getOrSet(cacheKey, WP_CATEGORIES_CACHE_TTL_SECONDS, async () => {
    const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
    const all: WPCategory[] = [];
    let page = 1;

    while (true) {
      const url = `${baseUrl}/wp-json/wp/v2/categories?per_page=100&page=${page}`;
      await assertPublicUrl(url);
      const res = await fetch(url, {
        headers: wpHeaders({ Authorization: auth }),
        cache: 'no-store',
        redirect: 'manual',
      });
      if (!res.ok) {
        if (res.status === 400 && page > 1) break;
        console.warn(`fetchWordPressCategories: ${res.status} on ${url} — returning partial results`);
        break;
      }
      const list = (await res.json()) as WPCategory[];
      all.push(...list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count })));
      if (list.length < 100) break;
      page++;
    }

    return all.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function changeWordPressPostStatus(
  website: Website,
  postId: number,
  status: 'draft' | 'trash' | 'publish'
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = website.url.replace(/\/$/, '');
  const username = website.wpUsername;
  const appPassword = decrypt(website.wpAppPassword);
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;

  const url = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
  await assertPublicUrl(url); // anti-SSRF : refuse IPs privées même si l'URL en DB a été modifiée

  const res = await fetch(url, {
    method: 'POST',
    headers: wpHeaders({ Authorization: auth, 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
    redirect: 'manual',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    console.error(
      `Failed to change status of post ${postId} to ${status}: ${res.status} ${errorText}`,
    );
    if (res.status === 403 && isCloudflareChallenge(errorText)) {
      return { success: false, error: 'Bloqué par Cloudflare Bot Protection' };
    }
    return { success: false, error: `WordPress error (HTTP ${res.status})` };
  }

  return { success: true };
}

export async function getWordPressPostInfo(
  website: Website,
  postId: number
): Promise<{ status: string; title: string; link: string } | null> {
  const baseUrl = website.url.replace(/\/$/, '');
  const username = website.wpUsername;
  const appPassword = decrypt(website.wpAppPassword);
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;

  const url = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
  await assertPublicUrl(url);

  const res = await fetch(url, {
    headers: wpHeaders({ Authorization: auth }),
    redirect: 'manual',
  });

  if (!res.ok) return null;
  const data = await res.json();
  return {
    status: data.status,
    title: data.title.rendered,
    link: data.link,
  };
}
