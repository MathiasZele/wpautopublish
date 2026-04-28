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
  const endpoint = `${params.website.url.replace(/\/$/, '')}/wp-json/wp-autopublish/v1/publish`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WP-AutoPublish-Secret': params.website.customEndpointKey,
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
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress ${response.status}: ${error}`);
  }

  return response.json() as Promise<{ success: boolean; post_id: number; url: string }>;
}

export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
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
  const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const all: WPCategory[] = [];
  let page = 1;

  while (true) {
    const url = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: auth }, cache: 'no-store' });
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
