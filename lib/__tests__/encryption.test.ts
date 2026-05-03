import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt } from '../encryption';

const VALID_KEY = '0'.repeat(64); // 64 hex chars = 32 bytes
const ANOTHER_KEY = '1'.repeat(64);

describe('encryption (AES-256-GCM)', () => {
  let savedKey: string | undefined;

  beforeAll(() => {
    savedKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = savedKey;
  });

  it('encrypts and decrypts correctly (roundtrip)', () => {
    const plaintext = 'my-secret-wp-app-password';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'same-text';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b); // IV différent → ciphertext différent
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles unicode and accents', () => {
    const plaintext = 'mot-de-passe-avec-accents-éàù-😎';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('handles long strings (1KB+)', () => {
    const plaintext = 'a'.repeat(2048);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('throws if ENCRYPTION_KEY is missing', () => {
    process.env.ENCRYPTION_KEY = '';
    expect(() => encrypt('test')).toThrow();
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  it('throws if ENCRYPTION_KEY is wrong length', () => {
    process.env.ENCRYPTION_KEY = 'abc'; // pas 64 chars
    expect(() => encrypt('test')).toThrow();
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  it('decrypt fails if tag corrupted', () => {
    const encrypted = encrypt('original');
    // Corrompre le tag : on flippe un bit dans la portion middle (12-28 = tag)
    const buf = Buffer.from(encrypted, 'base64');
    buf[15] ^= 0xff;
    const corrupted = buf.toString('base64');
    expect(() => decrypt(corrupted)).toThrow();
  });

  it('decrypt fails with wrong key', () => {
    const encrypted = encrypt('secret');
    process.env.ENCRYPTION_KEY = ANOTHER_KEY;
    expect(() => decrypt(encrypted)).toThrow();
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  it('encrypted output is base64', () => {
    const encrypted = encrypt('hello');
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
