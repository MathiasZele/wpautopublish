import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml } from '../sanitizeHtml';

describe('sanitizeArticleHtml', () => {
  describe('whitelist enforcement', () => {
    it('drops <script> tags', () => {
      const out = sanitizeArticleHtml('<p>safe</p><script>alert(1)</script>');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert');
      expect(out).toContain('safe');
    });

    it('drops <iframe>', () => {
      const out = sanitizeArticleHtml('<iframe src="https://evil.com"></iframe>');
      expect(out).not.toContain('iframe');
    });

    it('drops <img> (not in whitelist)', () => {
      // L'image est gérée séparément via featured_image_url, pas inline
      const out = sanitizeArticleHtml('<p>hi</p><img src=x onerror="alert(1)">');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('onerror');
    });

    it('drops <object>, <embed>, <style>', () => {
      const out = sanitizeArticleHtml('<object data="x"></object><embed src="x"><style>body{}</style>');
      expect(out).not.toContain('object');
      expect(out).not.toContain('embed');
      expect(out).not.toContain('style');
    });

    it('keeps allowed tags : h2, h3, p, ul, li, strong, em, a', () => {
      const html = '<h2>Title</h2><p><strong>Bold</strong> <em>italic</em></p><ul><li>item</li></ul><a href="https://ok.com">link</a>';
      const out = sanitizeArticleHtml(html);
      expect(out).toContain('<h2>');
      expect(out).toContain('<p>');
      expect(out).toContain('<strong>');
      expect(out).toContain('<em>');
      expect(out).toContain('<ul>');
      expect(out).toContain('<li>');
      expect(out).toContain('<a ');
    });
  });

  describe('protocol restrictions on <a>', () => {
    it('keeps http(s) links', () => {
      const out = sanitizeArticleHtml('<a href="https://example.com">ok</a>');
      expect(out).toContain('href="https://example.com"');
    });

    it('drops javascript: URLs', () => {
      const out = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>');
      expect(out).not.toContain('javascript:');
    });

    it('drops data: URLs', () => {
      const out = sanitizeArticleHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
      expect(out).not.toContain('data:');
    });

    it('forces rel="noopener noreferrer"', () => {
      const out = sanitizeArticleHtml('<a href="https://x.com" target="_blank">link</a>');
      expect(out).toContain('rel="noopener noreferrer"');
    });
  });

  describe('markdown residual conversion', () => {
    it('converts ## headers to <h2>', () => {
      const out = sanitizeArticleHtml('## Mon titre\n\nContent');
      expect(out).toContain('<h2>Mon titre</h2>');
    });

    it('converts **bold** to <strong>', () => {
      const out = sanitizeArticleHtml('Du **texte gras** ici');
      expect(out).toContain('<strong>texte gras</strong>');
    });

    it('converts [text](url) to <a>', () => {
      const out = sanitizeArticleHtml('Voir [le doc](https://example.com)');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('>le doc</a>');
      // Le sanitizer force toujours rel="noopener noreferrer"
      expect(out).toContain('rel="noopener noreferrer"');
    });
  });

  describe('event handlers stripped', () => {
    it('drops onclick / onerror / onload', () => {
      const out = sanitizeArticleHtml('<p onclick="alert(1)" onerror="x()">test</p>');
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('onerror');
    });
  });
});
