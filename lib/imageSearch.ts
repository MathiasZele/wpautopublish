import { openai } from './openai';

interface PexelsPhoto {
  id: number;
  src: { original: string; large: string; large2x: string };
  alt: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
}

async function searchPexels(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: key },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const data = (await res.json()) as PexelsResponse;
  if (!data.photos?.length) return null;
  const pick = data.photos[Math.floor(Math.random() * data.photos.length)];
  return pick.src.large2x ?? pick.src.large ?? pick.src.original;
}

async function generateOpenAIImage(prompt: string): Promise<string | null> {
  try {
    const result = await openai.images.generate({
      model: 'dall-e-2',
      prompt: `Photo réaliste, qualité éditoriale, sur le sujet : ${prompt}`,
      size: '1024x1024',
      n: 1,
    });
    return result.data?.[0]?.url ?? null;
  } catch (e) {
    console.error('OpenAI image generation failed', e);
    return null;
  }
}

/**
 * Trouve une image illustrant un sujet.
 * Priorité : Pexels (gratuit) → OpenAI DALL-E 2 (payant ~$0.02) → null.
 */
export async function findImageForTopic(topic: string): Promise<string | null> {
  const cleaned = topic.replace(/[^\p{L}\p{N}\s]/gu, ' ').slice(0, 100);

  const fromPexels = await searchPexels(cleaned).catch(() => null);
  if (fromPexels) return fromPexels;

  if (process.env.OPENAI_AUTO_IMAGE === 'true') {
    return generateOpenAIImage(cleaned);
  }

  return null;
}
