import { Website } from '@prisma/client';
import { decrypt } from './encryption';
import { assertPublicUrl, safeFetch } from './safeUrl';

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
    headers: {
      'Content-Type': 'application/json',
      'X-WP-AutoPublish-Secret': decryptedSecret,
    },
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
    throw new Error(`WordPress ${response.status}`);
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
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`,
      },
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!response.ok) {
      if (response.status === 403) {
        return {
          success: false,
          error: 'Accès refusé (403) — vérifiez que l\'API REST WordPress est activée et que les mots de passe d\'application sont autorisés',
        };
      }
      if (response.status === 401) {
        return { success: false, error: 'Identifiants incorrects (401) — vérifiez le nom d\'utilisateur et le mot de passe d\'application' };
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
  const headers = { Authorization: auth };

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

export async function fetchWordPressCategories(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<WPCategory[]> {
  const baseUrl = siteUrl.replace(/\/$/, '');
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const all: WPCategory[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/wp-json/wp/v2/categories?per_page=100&page=${page}`;
    await assertPublicUrl(url);
    const res = await fetch(url, {
      headers: { Authorization: auth },
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!res.ok) {
      // Page suivante vide (WordPress renvoie 400 quand il n'y a plus de pages)
      if (res.status === 400 && page > 1) break;
      // L'API REST est bloquée ou les droits sont insuffisants : on retourne ce qu'on a
      console.warn(`fetchWordPressCategories: ${res.status} on ${url} — returning partial results`);
      break;
    }
    const list = (await res.json()) as WPCategory[];
    all.push(...list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count })));
    if (list.length < 100) break;
    page++;
  }

  return all.sort((a, b) => a.name.localeCompare(b.name));
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

  let url = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
  let method = 'POST';
  let body = JSON.stringify({ status });

  // Note: Both POST with { status: 'trash' } and DELETE work in WP, 
  // but POST is generally safer against some firewall rules.


  const res = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: body ? body : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    console.error(`Failed to change status of post ${postId} to ${status}: ${res.status} ${errorText}`);
    return { success: false, error: `${res.status} ${res.statusText}` };
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

  const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}`, {
    headers: { Authorization: auth },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return {
    status: data.status,
    title: data.title.rendered,
    link: data.link,
  };
}
