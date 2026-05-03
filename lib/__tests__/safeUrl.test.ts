import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertPublicUrl, UnsafeUrlError } from '../safeUrl';
import * as dnsModule from 'dns';

// Mock dns.lookup pour les tests qui doivent passer la résolution
vi.mock('dns', async () => {
  const actual = await vi.importActual<typeof import('dns')>('dns');
  return {
    ...actual,
    promises: {
      lookup: vi.fn(),
    },
  };
});

// `dns.lookup({ all: true })` retourne LookupAddress[] mais l'overload typé pris par
// vi.mocked est la version single-result. On caste pour pouvoir mock le mode `all`.
const mockLookup = vi.mocked(dnsModule.promises.lookup) as unknown as ReturnType<typeof vi.fn>;

describe('assertPublicUrl', () => {
  beforeEach(() => {
    // Par défaut : DNS résout vers un IP public
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('protocol restrictions', () => {
    it('rejects file://', async () => {
      await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects ftp://', async () => {
      await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects gopher://', async () => {
      await expect(assertPublicUrl('gopher://example.com')).rejects.toThrow(UnsafeUrlError);
    });

    it('accepts https://', async () => {
      const url = await assertPublicUrl('https://example.com');
      expect(url.toString()).toBe('https://example.com/');
    });

    it('accepts http://', async () => {
      const url = await assertPublicUrl('http://example.com');
      expect(url.toString()).toBe('http://example.com/');
    });
  });

  describe('blocked hostnames (no DNS lookup needed)', () => {
    it('rejects localhost', async () => {
      await expect(assertPublicUrl('http://localhost')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects metadata.google.internal', async () => {
      await expect(assertPublicUrl('http://metadata.google.internal/')).rejects.toThrow(UnsafeUrlError);
    });
  });

  describe('private IPv4 literals', () => {
    it('rejects 127.0.0.1', async () => {
      await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects 10.0.0.1', async () => {
      await expect(assertPublicUrl('http://10.0.0.1/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects 169.254.169.254 (cloud metadata)', async () => {
      await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects 192.168.1.1', async () => {
      await expect(assertPublicUrl('http://192.168.1.1/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects 172.16.0.1 (private RFC1918)', async () => {
      await expect(assertPublicUrl('http://172.16.0.1/')).rejects.toThrow(UnsafeUrlError);
    });

    it('accepts public IPv4 literal', async () => {
      const url = await assertPublicUrl('http://8.8.8.8/');
      expect(url.hostname).toBe('8.8.8.8');
    });
  });

  describe('private IPv6 literals', () => {
    it('rejects ::1', async () => {
      await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects fe80:: (link-local)', async () => {
      await expect(assertPublicUrl('http://[fe80::1]/')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects fc00:: (ULA)', async () => {
      await expect(assertPublicUrl('http://[fc00::1]/')).rejects.toThrow(UnsafeUrlError);
    });
  });

  describe('DNS resolution check (rebinding)', () => {
    it('rejects hostname resolving to private IP', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(assertPublicUrl('http://attacker.example/')).rejects.toThrow(/IP privée/);
    });

    it('rejects hostname resolving to private IPv6', async () => {
      mockLookup.mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
      await expect(assertPublicUrl('http://attacker.example/')).rejects.toThrow(/IPv6 privée/);
    });

    it('rejects DNS lookup failure', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(assertPublicUrl('http://nonexistent.example/')).rejects.toThrow(/DNS lookup/);
    });

    it('accepts public DNS resolution', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      const url = await assertPublicUrl('http://example.com/');
      expect(url.hostname).toBe('example.com');
    });
  });

  describe('input validation', () => {
    it('rejects malformed URL', async () => {
      await expect(assertPublicUrl('not a url')).rejects.toThrow(UnsafeUrlError);
    });

    it('rejects empty string', async () => {
      await expect(assertPublicUrl('')).rejects.toThrow(UnsafeUrlError);
    });

    it('trims whitespace', async () => {
      const url = await assertPublicUrl('  https://example.com  ');
      expect(url.hostname).toBe('example.com');
    });
  });
});
