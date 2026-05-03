import { promises as dns } from 'dns';

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^224\./,
  /^255\./,
];

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((re) => re.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  if (ip === '::1' || ip === '::') return true;
  if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
  if (ip.toLowerCase().startsWith('fe80:')) return true;
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`URL refusée : ${reason}`);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Valide qu'une URL pointe vers un hôte public et utilise HTTP(S).
 * Résout le DNS pour bloquer les rebinding attacks vers des IPs privées.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    console.error(`Invalid URL format: "${trimmed}"`);
    throw new UnsafeUrlError(`format URL invalide : "${trimmed.slice(0, 50)}..."`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`protocole ${url.protocol} non autorisé`);
  }

  // Node URL conserve les brackets autour des IPv6 (ex: "[::1]") — on les retire
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError(`hôte ${host} bloqué`);
  }

  // IPv4 littérale
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIpv4(host)) throw new UnsafeUrlError(`IP privée ${host}`);
    return url;
  }

  // IPv6 littérale
  if (host.includes(':')) {
    if (isPrivateIpv6(host)) throw new UnsafeUrlError(`IPv6 privée ${host}`);
    return url;
  }

  // DNS lookup pour vérifier qu'aucun A/AAAA ne pointe sur du privé
  try {
    const addresses = await dns.lookup(host, { all: true });
    for (const a of addresses) {
      if (a.family === 4 && isPrivateIpv4(a.address)) {
        throw new UnsafeUrlError(`DNS de ${host} pointe sur IP privée ${a.address}`);
      }
      if (a.family === 6 && isPrivateIpv6(a.address)) {
        throw new UnsafeUrlError(`DNS de ${host} pointe sur IPv6 privée ${a.address}`);
      }
    }
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    throw new UnsafeUrlError(`DNS lookup échoué pour ${host}`);
  }

  return url;
}

