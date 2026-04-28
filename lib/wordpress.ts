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
      if (res.status === 400 && page > 1) break;
      throw new Error(`WP categories ${res.status}`);
    }
    const list = (await res.json()) as WPCategory[];
    all.push(...list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count })));
    if (list.length < 100) break;
    page++;
  }

  return all.sort((a, b) => a.name.localeCompare(b.name));
}
